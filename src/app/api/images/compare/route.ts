/**
 * POST /api/images/compare
 *
 * Compare two images side by side — no MongoDB write, no Vision search.
 * Returns pHash distance, CLIP similarity, ELA for both, and a similarity verdict.
 *
 * Accepts multipart/form-data with fields: imageA, imageB
 * Or application/json: { urlA: string, urlB: string }
 */

import { NextRequest, NextResponse }  from 'next/server';
import { downloadImageFromUrl, validateImageBuffer, InvalidUrlError, NotAnImageError, FileTooLargeError } from '@/lib/utils/imageIngestion';
import { generateFingerprints }       from '@/lib/utils/fingerprint';
import { extractExifData }            from '@/lib/utils/exifExtractor';
import { performELA }                 from '@/lib/utils/elaAnalysis';
import { assessEditProbability }      from '@/lib/utils/editDetector';
import { analyzeVisualEdits }         from '@/lib/utils/visualEditAnalysis';
import { faceService }                from '@/lib/services/faceService';
import { uploadImage }                from '@/lib/cloudinary/upload';
import { hammingDistance }            from '@/lib/utils/duplicateDetector';
import { cosineSimilarity }           from '@/lib/services/clipService';

export const maxDuration = 90;

// ─── Similarity verdict ────────────────────────────────────────────────────────

/**
 * Verdicts:
 *   identical   — byte-for-byte or visually identical
 *   same_image  — same image with modifications (bg swap, crop, filter, watermark)
 *   related     — visually similar scene or composition
 *   different   — low similarity
 *
 * Decision order:
 *   1. Crypto match → identical
 *   2. Both hashes zero → identical
 *   3. CLIP ≥ 0.87 → same_image
 *      (bg removal pushes dHash to 50–80 bits but keeps CLIP high;
 *       two different people in similar settings cap at CLIP ~0.82–0.85)
 *   4. Combined score (CLIP×0.72 + dHashSim×0.28):
 *      ≥ 0.88 → same_image, ≥ 0.70 → related, below → different
 *
 *   dHashSim is normalised over 256 bits (64-hex × 4 bits).
 */
function computeVerdict(
  dHashDist:       number,
  pHashDist:       number,
  clipSim:         number | null,
  cryptoHashMatch: boolean,
): { verdict: string; confidence: number; description: string } {

  if (cryptoHashMatch)
    return { verdict: 'identical', confidence: 1.0, description: 'Byte-for-byte identical — exact same file.' };

  if (dHashDist === 0 && pHashDist === 0)
    return { verdict: 'identical', confidence: 0.99, description: 'Visually identical — same content, possibly re-saved or losslessly re-encoded.' };

  const dHashSim = Math.max(0, 1 - dHashDist / 256);

  // High CLIP → same image, modified context
  if (clipSim !== null && clipSim >= 0.87)
    return {
      verdict:     'same_image',
      confidence:  Math.min(0.97, 0.68 + clipSim * 0.30),
      description: 'Same image with modified context — background, lighting, colour grade, or crop.',
    };

  // Combined score
  const combined = clipSim !== null
    ? clipSim * 0.72 + dHashSim * 0.28
    : dHashSim;

  if (combined >= 0.88)
    return {
      verdict:     'same_image',
      confidence:  clipSim !== null ? 0.86 : 0.79,
      description: 'Same image with minor modifications — resize, compression, watermark, or subtle edit.',
    };

  if (combined >= 0.70)
    return {
      verdict:     'related',
      confidence:  0.55 + (combined - 0.70) * 0.50,
      description: 'Images share visual characteristics — similar scene, composition, or style.',
    };

  return {
    verdict:     'different',
    confidence:  Math.min(0.95, 0.50 + (0.70 - combined) * 1.20),
    description: 'Images appear to be different — low visual and semantic similarity.',
  };
}

// ─── Analyse one image ─────────────────────────────────────────────────────────

async function analyseImage(buffer: Buffer) {
  const [fingerprints, exifData, uploadResult] = await Promise.all([
    generateFingerprints(buffer),
    extractExifData(buffer),
    uploadImage(buffer, {}),
  ]);

  const [elaResult, visualResult, clipEditResult] = await Promise.all([
    performELA(buffer).catch(() => ({
      elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
      isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
    })),
    analyzeVisualEdits(buffer, exifData.width, exifData.height, exifData.fileSize),
    faceService.classifyEditing(buffer).catch(() => null),
  ]);

  const assessment = assessEditProbability(exifData, elaResult, null, null, visualResult, clipEditResult);

  return { fingerprints, exifData, uploadResult, elaResult, assessment, visualResult };
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    let bufferA: Buffer;
    let bufferB: Buffer;
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileA    = formData.get('imageA') as File | null;
      const fileB    = formData.get('imageB') as File | null;
      if (!fileA || !fileB)
        return NextResponse.json({ error: 'Both imageA and imageB are required', code: 'MISSING_FILES' }, { status: 400 });
      [bufferA, bufferB] = await Promise.all([
        fileA.arrayBuffer().then(Buffer.from),
        fileB.arrayBuffer().then(Buffer.from),
      ]);
    } else {
      let body: { urlA?: string; urlB?: string };
      try { body = await request.json(); }
      catch { return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 }); }
      if (!body.urlA?.trim() || !body.urlB?.trim())
        return NextResponse.json({ error: 'Both urlA and urlB are required', code: 'MISSING_URLS' }, { status: 400 });
      [bufferA, bufferB] = await Promise.all([
        downloadImageFromUrl(body.urlA.trim()),
        downloadImageFromUrl(body.urlB.trim()),
      ]);
    }

    const [valA, valB] = await Promise.all([
      validateImageBuffer(bufferA),
      validateImageBuffer(bufferB),
    ]);
    if (!valA.valid) return NextResponse.json({ error: `Image A: ${valA.error}`, code: 'INVALID_IMAGE_A' }, { status: 422 });
    if (!valB.valid) return NextResponse.json({ error: `Image B: ${valB.error}`, code: 'INVALID_IMAGE_B' }, { status: 422 });

    const [[resultA, resultB], faceResult, partialResult] = await Promise.all([
      Promise.all([analyseImage(bufferA), analyseImage(bufferB)]),
      faceService.compareFaces(bufferA, bufferB),
      faceService.detectPartialMatch(bufferA, bufferB),
    ]);

    const pHashDist   = hammingDistance(resultA.fingerprints.pHash, resultB.fingerprints.pHash);
    const dHashDist   = hammingDistance(resultA.fingerprints.dHash, resultB.fingerprints.dHash);
    const cryptoMatch = resultA.fingerprints.cryptoHash === resultB.fingerprints.cryptoHash;
    const clipSim     = resultA.fingerprints.clipEmbedding && resultB.fingerprints.clipEmbedding
      ? cosineSimilarity(resultA.fingerprints.clipEmbedding, resultB.fingerprints.clipEmbedding)
      : null;

    let { verdict, confidence, description } = computeVerdict(dHashDist, pHashDist, clipSim, cryptoMatch);

    // If faces are detected in both images but don't match, downgrade the verdict.
    // A high CLIP score just means similar background/composition — different people
    // can't be "same_image" or even "related".
    if (faceResult?.faceDetected && faceResult.matchLevel === 'no_match') {
      if (verdict === 'same_image') {
        verdict     = 'related';
        confidence  = Math.min(confidence, 0.60);
        description = 'Similar composition or scene, but face recognition identifies different people.';
      } else if (verdict === 'related') {
        verdict     = 'different';
        confidence  = Math.min(confidence, 0.70);
        description = 'Different people detected by face recognition — visually similar setting only.';
      }
    }

    // Partial/crop detection: if one image is a spatial sub-region of the other,
    // upgrade "different" → "related" and "related" → "same_image".
    // pHash changes completely on a crop so the base verdict is usually wrong.
    if (partialResult?.isPartial) {
      const cropLabel = partialResult.which === 'B_in_A'
        ? 'Image B is a cropped region of Image A.'
        : partialResult.which === 'A_in_B'
          ? 'Image A is a cropped region of Image B.'
          : 'One image is a cropped region of the other.';

      if (verdict === 'different') {
        verdict     = 'related';
        confidence  = Math.max(confidence, partialResult.confidence * 0.85);
        description = `${cropLabel} Partial copy or derived crop detected.`;
      } else if (verdict === 'related') {
        verdict     = 'same_image';
        confidence  = Math.max(confidence, partialResult.confidence * 0.90);
        description = `${cropLabel} Same image, partial region extracted.`;
      }
      // If already same_image/identical, leave it — the partial match only confirms it
    }

    const buildImagePayload = (r: Awaited<ReturnType<typeof analyseImage>>) => ({
      cloudinaryUrl: r.uploadResult.url,
      pHash:         r.fingerprints.pHash,
      cryptoHash:    r.fingerprints.cryptoHash,
      clipAvailable: r.fingerprints.clipServiceAvailable,
      metadata: {
        width:       r.exifData.width,
        height:      r.exifData.height,
        format:      r.exifData.format,
        fileSize:    r.exifData.fileSize,
        dateCreated: r.exifData.dateCreated ?? null,
        camera:      r.exifData.camera ?? null,
        software:    r.exifData.software ?? null,
      },
      ela: {
        score:           r.elaResult.elaScore,
        heatmapUrl:      r.elaResult.elaHeatmapUrl || null,
        isLikelyEdited:  r.elaResult.isLikelyEdited,
        highDiffRegions: r.elaResult.highDiffRegions,
      },
      assessment: {
        verdict:           r.assessment.verdict,
        editProbability:   r.assessment.editProbability,
        overallConfidence: r.assessment.overallConfidence,
        signals:           r.assessment.signals,
      },
    });

    return NextResponse.json({
      status:         'success',
      processingTime: Date.now() - startTime,
      imageA:         buildImagePayload(resultA),
      imageB:         buildImagePayload(resultB),
      comparison: {
        pHashDistance:   pHashDist,
        dHashDistance:   dHashDist,
        clipSimilarity:  clipSim,
        cryptoHashMatch: cryptoMatch,
        verdict,
        confidence,
        description,
        face: faceResult ? {
          matchLevel:    faceResult.matchLevel,
          confidence:    faceResult.confidence,
          verified:      faceResult.verified,
          distance:      faceResult.distance,
          faceDetected:  faceResult.faceDetected,
        } : null,
        partialMatch: partialResult ? {
          isPartial:  partialResult.isPartial,
          confidence: partialResult.confidence,
          which:      partialResult.which,
        } : null,
      },
    });

  } catch (error: unknown) {
    if (error instanceof InvalidUrlError)   return NextResponse.json({ error: error.message, code: 'INVALID_URL' },   { status: 400 });
    if (error instanceof NotAnImageError)   return NextResponse.json({ error: error.message, code: 'NOT_AN_IMAGE' }, { status: 422 });
    if (error instanceof FileTooLargeError) return NextResponse.json({ error: error.message, code: 'TOO_LARGE' },    { status: 413 });
    console.error('[/api/images/compare]', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
