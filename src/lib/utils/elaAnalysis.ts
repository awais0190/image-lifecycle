/**
 * elaAnalysis.ts — Phase 04
 * Error Level Analysis (ELA): detect image editing by comparing
 * compression artifacts between the original and a re-compressed version.
 *
 * Algorithm:
 *   1. Normalise to JPEG (PNGs converted at 95% quality first)
 *   2. Resize to max 512px (performance + consistent output size)
 *   3. Re-save at 75% quality to introduce compression artefacts
 *   4. Compare pixels — amplify differences ×10
 *   5. Build warm-colour heatmap (red = edited, black = authentic)
 *   6. Upload heatmap PNG to Cloudinary under ela-heatmaps/
 *   7. Return normalised elaScore + metadata
 */

import crypto  from 'crypto';
import sharp   from 'sharp';
import { uploadImage } from '@/lib/cloudinary/upload';
import { ELA_THRESHOLDS, ELA_CLOUDINARY_SUBFOLDER } from '@/lib/utils/constants';
import type { ELAResult } from '@/types/image';

// Maximum side length to use for ELA (performance + network)
const MAX_ELA_DIM = 512;

/**
 * Run Error Level Analysis on an image buffer.
 * Never throws — on any failure returns a safe zero-score result.
 */
export async function performELA(originalBuffer: Buffer): Promise<ELAResult> {
  const startTime = Date.now();
  console.log('[ELA] Starting Error Level Analysis…');

  try {
    // ── Step 1: Normalise to JPEG ──────────────────────────────────────────
    const meta = await sharp(originalBuffer).metadata();
    const format = meta.format ?? 'jpeg';

    let workBuffer: Buffer;
    if (format !== 'jpeg') {
      // ELA is only meaningful for JPEG compression artefacts.
      // Convert PNG/WEBP → JPEG first at near-lossless quality.
      workBuffer = await sharp(originalBuffer)
        .jpeg({ quality: 95 })
        .toBuffer();
      console.log('[ELA] Converted from', format, 'to JPEG for analysis');
    } else {
      workBuffer = originalBuffer;
    }

    // ── Step 2: Resize to max ELA_DIM for consistent performance ──────────
    const sharpMeta = await sharp(workBuffer).metadata();
    const origW = sharpMeta.width  ?? 512;
    const origH = sharpMeta.height ?? 512;
    const scale = Math.max(origW, origH) > MAX_ELA_DIM
      ? MAX_ELA_DIM / Math.max(origW, origH)
      : 1;
    const elaW = Math.round(origW * scale);
    const elaH = Math.round(origH * scale);

    if (scale < 1) {
      workBuffer = await sharp(workBuffer)
        .resize(elaW, elaH)
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    // ── Step 3: Re-compress at 75% ─────────────────────────────────────────
    const recompressed = await sharp(workBuffer)
      .jpeg({ quality: 75 })
      .toBuffer();

    // ── Step 4: Get raw RGB pixel buffers (no alpha) ───────────────────────
    const { data: origData, info: origInfo } = await sharp(workBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: recompData } = await sharp(recompressed)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels   = origInfo.channels;   // should be 3 (RGB)
    const pixelCount = origInfo.width * origInfo.height;

    // ── Step 5: Compute per-pixel diff, build heatmap buffer ──────────────
    const heatmapBuffer = Buffer.allocUnsafe(pixelCount * 3);
    let totalDiff       = 0;
    let highDiffRegions = 0;

    const orig   = origData   as Buffer;
    const recomp = recompData as Buffer;

    for (let i = 0; i < pixelCount; i++) {
      let channelDiff = 0;
      for (let c = 0; c < channels; c++) {
        channelDiff += Math.abs(orig[i * channels + c] - recomp[i * channels + c]);
      }
      const avgDiff  = channelDiff / channels;       // 0–255 per pixel
      totalDiff     += avgDiff;

      // Amplify for heatmap visibility
      const amplified = Math.min(255, Math.round(avgDiff * 10));
      if (amplified > 50) highDiffRegions++;

      // Warm colorization: high diff → red/orange, low diff → black
      heatmapBuffer[i * 3]     = amplified;                                    // R
      heatmapBuffer[i * 3 + 1] = Math.min(255, Math.round(amplified * 0.4));  // G (warm tint)
      heatmapBuffer[i * 3 + 2] = 0;                                            // B
    }

    // ── Normalised score ───────────────────────────────────────────────────
    const elaScore = totalDiff / (pixelCount * 255);  // 0–1

    // ── Step 6: Encode heatmap as PNG ─────────────────────────────────────
    const heatmapPng = await sharp(heatmapBuffer, {
      raw: { width: origInfo.width, height: origInfo.height, channels: 3 },
    })
      .png()
      .toBuffer();

    // ── Step 7: Upload to Cloudinary ela-heatmaps/ ─────────────────────────
    const elaId = crypto.createHash('sha256').update(workBuffer).digest('hex');
    const upload = await uploadImage(heatmapPng, {
      sha256Hash: `ela_${elaId.slice(0, 32)}`,
      subfolder:  ELA_CLOUDINARY_SUBFOLDER,
      tags:       ['ela-heatmap'],
    });

    const analysisTime = Date.now() - startTime;
    console.log(
      `[ELA] Done in ${analysisTime}ms — score: ${elaScore.toFixed(4)}, highDiffRegions: ${highDiffRegions}`
    );

    return {
      elaScore,
      elaHeatmapUrl:      upload.url,
      elaHeatmapPublicId: upload.publicId,
      isLikelyEdited:     elaScore > ELA_THRESHOLDS.LIKELY_EDITED,
      confidence:         elaScore > ELA_THRESHOLDS.LIKELY_EDITED   ? 0.85
                        : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? 0.55
                        : 0.80,  // low score = confident it's NOT edited
      highDiffRegions,
      analysisTime,
    };

  } catch (error) {
    const analysisTime = Date.now() - startTime;
    console.error('[ELA] Analysis failed (continuing without ELA):', (error as Error).message);

    // Safe zero-score result so the pipeline is never blocked by ELA failure
    return {
      elaScore:           0,
      elaHeatmapUrl:      '',
      elaHeatmapPublicId: '',
      isLikelyEdited:     false,
      confidence:         0,
      highDiffRegions:    0,
      analysisTime,
    };
  }
}
