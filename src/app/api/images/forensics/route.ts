/**
 * POST /api/images/forensics
 *
 * Standalone forensics pipeline — no Vision search, no tree, no MongoDB write.
 * Fast single-image analysis: ELA + EXIF + CLIP + edit assessment.
 *
 * Accepts:
 *   multipart/form-data  { image: File }
 *   application/json     { url: string }
 */

import { NextRequest, NextResponse }  from 'next/server';
import { downloadImageFromUrl, validateImageBuffer, InvalidUrlError, NotAnImageError, FileTooLargeError } from '@/lib/utils/imageIngestion';
import { generateFingerprints }       from '@/lib/utils/fingerprint';
import { extractExifData }            from '@/lib/utils/exifExtractor';
import { performELA }                 from '@/lib/utils/elaAnalysis';
import { assessEditProbability }      from '@/lib/utils/editDetector';
import { uploadImage }                from '@/lib/cloudinary/upload';
import { faceService }                from '@/lib/services/faceService';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Parse request ──────────────────────────────────────────────────────
    let buffer: Buffer;
    let filename = 'image';
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file     = formData.get('image') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No image file provided', code: 'MISSING_FILE' }, { status: 400 });
      }
      buffer   = Buffer.from(await file.arrayBuffer());
      filename = file.name;
    } else {
      let body: { url?: string };
      try { body = await request.json(); }
      catch { return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 }); }
      if (!body.url?.trim()) {
        return NextResponse.json({ error: 'No URL provided', code: 'MISSING_URL' }, { status: 400 });
      }
      buffer   = await downloadImageFromUrl(body.url.trim());
      filename = new URL(body.url.trim()).pathname.split('/').at(-1) ?? 'image';
    }

    // ── Validate ───────────────────────────────────────────────────────────
    const validation = await validateImageBuffer(buffer);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error, code: 'INVALID_IMAGE' }, { status: 422 });
    }

    // ── Run all analyses in parallel where possible ────────────────────────
    const [fingerprints, exifData, uploadResult, faceResult] = await Promise.all([
      generateFingerprints(buffer),
      extractExifData(buffer),
      uploadImage(buffer, {}),
      faceService.detectFace(buffer),
    ]);

    const elaResult = await performELA(buffer).catch(() => ({
      elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
      isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
    }));

    const assessment = assessEditProbability(exifData, elaResult, null);

    return NextResponse.json({
      status:      'success',
      filename,
      processingTime: Date.now() - startTime,
      image: {
        cloudinaryUrl:  uploadResult.url,
        cloudinaryPublicId: uploadResult.publicId,
        pHash:          fingerprints.pHash,
        cryptoHash:     fingerprints.cryptoHash,
        clipEmbedding:  fingerprints.clipEmbedding,
        clipAvailable:  fingerprints.clipServiceAvailable,
      },
      metadata: {
        width:       exifData.width,
        height:      exifData.height,
        format:      exifData.format,
        fileSize:    exifData.fileSize,
        dateCreated: exifData.dateCreated ?? null,
        camera:      exifData.camera ?? null,
        software:    exifData.software ?? null,
        gps:         exifData.gps ?? null,
      },
      ela: {
        score:          elaResult.elaScore,
        heatmapUrl:     elaResult.elaHeatmapUrl || null,
        isLikelyEdited: elaResult.isLikelyEdited,
        highDiffRegions: elaResult.highDiffRegions,
        analysisTime:   elaResult.analysisTime,
      },
      assessment: {
        verdict:         assessment.verdict,
        editProbability: assessment.editProbability,
        overallConfidence: assessment.overallConfidence,
        signals:         assessment.signals,
      },
      face: faceResult ? {
        faceDetected: faceResult.faceDetected,
        faceCount:    faceResult.faceCount,
        confidence:   faceResult.confidence,
      } : null,
    });

  } catch (error: unknown) {
    if (error instanceof InvalidUrlError)   return NextResponse.json({ error: error.message, code: 'INVALID_URL' },   { status: 400 });
    if (error instanceof NotAnImageError)   return NextResponse.json({ error: error.message, code: 'NOT_AN_IMAGE' }, { status: 422 });
    if (error instanceof FileTooLargeError) return NextResponse.json({ error: error.message, code: 'TOO_LARGE' },    { status: 413 });
    console.error('[/api/images/forensics]', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
