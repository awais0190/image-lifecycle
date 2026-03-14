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
import { uploadImage }                from '@/lib/cloudinary/upload';
import { hammingDistance }            from '@/lib/utils/duplicateDetector';
import { cosineSimilarity }           from '@/lib/services/clipService';
import { SIMILARITY_THRESHOLDS }      from '@/lib/utils/constants';

export const maxDuration = 90;

// ─── Similarity verdict ────────────────────────────────────────────────────────

function computeVerdict(
  pHashDist:       number,
  clipSim:         number | null,
  cryptoHashMatch: boolean,
): { verdict: string; confidence: number; description: string } {
  if (cryptoHashMatch) {
    return { verdict: 'identical', confidence: 1.0, description: 'Byte-for-byte identical files — exact same image.' };
  }
  if (pHashDist === 0) {
    return { verdict: 'identical', confidence: 0.99, description: 'Visually identical perceptual hash — same image content.' };
  }
  if (pHashDist <= 10 || (clipSim !== null && clipSim >= SIMILARITY_THRESHOLDS.CLIP_STRONG)) {
    return { verdict: 'similar', confidence: 0.85, description: 'Images are visually very similar — likely same source with minor changes.' };
  }
  if (pHashDist <= 20 || (clipSim !== null && clipSim >= SIMILARITY_THRESHOLDS.CLIP_WEAK)) {
    return { verdict: 'related', confidence: 0.60, description: 'Images share visual characteristics — possibly cropped, resized, or edited versions.' };
  }
  return { verdict: 'different', confidence: 0.90, description: 'Images appear to be different — low visual and semantic similarity.' };
}

// ─── Analyse one image ─────────────────────────────────────────────────────────

async function analyseImage(buffer: Buffer) {
  const [fingerprints, exifData, uploadResult] = await Promise.all([
    generateFingerprints(buffer),
    extractExifData(buffer),
    uploadImage(buffer, {}),
  ]);

  const elaResult = await performELA(buffer).catch(() => ({
    elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
    isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
  }));

  const assessment = assessEditProbability(exifData, elaResult, null);

  return { fingerprints, exifData, uploadResult, elaResult, assessment };
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
      if (!fileA || !fileB) {
        return NextResponse.json({ error: 'Both imageA and imageB are required', code: 'MISSING_FILES' }, { status: 400 });
      }
      [bufferA, bufferB] = await Promise.all([
        fileA.arrayBuffer().then(Buffer.from),
        fileB.arrayBuffer().then(Buffer.from),
      ]);
    } else {
      let body: { urlA?: string; urlB?: string };
      try { body = await request.json(); }
      catch { return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 }); }
      if (!body.urlA?.trim() || !body.urlB?.trim()) {
        return NextResponse.json({ error: 'Both urlA and urlB are required', code: 'MISSING_URLS' }, { status: 400 });
      }
      [bufferA, bufferB] = await Promise.all([
        downloadImageFromUrl(body.urlA.trim()),
        downloadImageFromUrl(body.urlB.trim()),
      ]);
    }

    // Validate both
    const [valA, valB] = await Promise.all([
      validateImageBuffer(bufferA),
      validateImageBuffer(bufferB),
    ]);
    if (!valA.valid) return NextResponse.json({ error: `Image A: ${valA.error}`, code: 'INVALID_IMAGE_A' }, { status: 422 });
    if (!valB.valid) return NextResponse.json({ error: `Image B: ${valB.error}`, code: 'INVALID_IMAGE_B' }, { status: 422 });

    // Analyse both in parallel
    const [resultA, resultB] = await Promise.all([
      analyseImage(bufferA),
      analyseImage(bufferB),
    ]);

    // ── Compute comparison metrics ─────────────────────────────────────────
    const pHashDist     = hammingDistance(resultA.fingerprints.pHash, resultB.fingerprints.pHash);
    const cryptoMatch   = resultA.fingerprints.cryptoHash === resultB.fingerprints.cryptoHash;
    const bothHaveClip  =
      resultA.fingerprints.clipEmbedding !== null &&
      resultB.fingerprints.clipEmbedding !== null;
    const clipSim = bothHaveClip
      ? cosineSimilarity(resultA.fingerprints.clipEmbedding!, resultB.fingerprints.clipEmbedding!)
      : null;

    const { verdict, confidence, description } = computeVerdict(pHashDist, clipSim, cryptoMatch);

    const buildImagePayload = (r: Awaited<ReturnType<typeof analyseImage>>) => ({
      cloudinaryUrl:    r.uploadResult.url,
      pHash:            r.fingerprints.pHash,
      cryptoHash:       r.fingerprints.cryptoHash,
      clipAvailable:    r.fingerprints.clipServiceAvailable,
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
        score:          r.elaResult.elaScore,
        heatmapUrl:     r.elaResult.elaHeatmapUrl || null,
        isLikelyEdited: r.elaResult.isLikelyEdited,
        highDiffRegions: r.elaResult.highDiffRegions,
      },
      assessment: {
        verdict:          r.assessment.verdict,
        editProbability:  r.assessment.editProbability,
        overallConfidence: r.assessment.overallConfidence,
        signals:          r.assessment.signals,
      },
    });

    return NextResponse.json({
      status:   'success',
      processingTime: Date.now() - startTime,
      imageA:   buildImagePayload(resultA),
      imageB:   buildImagePayload(resultB),
      comparison: {
        pHashDistance:    pHashDist,
        clipSimilarity:   clipSim,
        cryptoHashMatch:  cryptoMatch,
        verdict,
        confidence,
        description,
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
