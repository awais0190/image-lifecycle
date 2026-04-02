/**
 * visualEditAnalysis.ts
 *
 * Pixel-level and metadata-level editing detection that catches what ELA misses:
 *
 *  • Text/watermark overlay detection — high-frequency bimodal regions in the image
 *  • Uniform border detection        — letterboxing, padding bands added during editing
 *  • Compression fingerprint         — bytes/pixel ratio reveals web-processed thumbnails
 *  • Social-media format detection   — exact dimension / aspect ratio match → post-processed
 *  • Noise inconsistency             — variance differs sharply between regions → compositing
 *
 * All pixel work is done on a 256px-max downsample for speed.
 * Never throws — on any error returns a zero-score safe result.
 */

import sharp from 'sharp';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisualAnalysisResult {
  /** True when black/white/solid letterbox bars detected on any edge */
  hasUniformBorders: boolean;
  /** True when text-overlay pattern (high-contrast bimodal blocks) found */
  hasTextRegions: boolean;
  /** Fraction of image that shows text-overlay pattern (0–1) */
  textCoverage: number;
  /** bytes / (width × height) — low value = heavily compressed web image */
  compressionRatio: number;
  /** True when dimensions exactly match common social-media formats */
  isSocialMediaFormat: boolean;
  /** Short label: "square", "story_9x16", "landscape_16x9", "portrait_4x5", etc. */
  aspectCategory: string;
  /** 0–1 variance of local noise between image quadrants — high = composited */
  noiseInconsistency: number;
  /** Combined visual edit signal score (0–1) */
  editScore: number;
  /** Human-readable reasons that contributed to the edit score */
  reasons: string[];
}

// ─── Social-media dimension table ─────────────────────────────────────────────

const SOCIAL_DIMS: Array<{ w: number; h: number; label: string }> = [
  { w: 1080, h: 1080, label: 'Instagram square'          },
  { w: 1080, h: 1350, label: 'Instagram portrait 4:5'    },
  { w: 1080, h:  566, label: 'Instagram landscape 1.91:1' },
  { w: 1080, h: 1920, label: 'Instagram/TikTok story 9:16' },
  { w: 1280, h:  720, label: 'YouTube thumbnail 16:9'    },
  { w: 1920, h: 1080, label: '1080p 16:9'                },
  { w:  720, h:  720, label: 'Twitter square'            },
  { w: 1500, h:  500, label: 'Twitter banner'            },
  { w:  820, h:  312, label: 'Facebook cover'            },
  { w: 1200, h:  630, label: 'OG / link preview'         },
  { w:  800, h:  800, label: 'Generic square thumbnail'  },
  { w:  640, h:  640, label: 'Small square thumbnail'    },
  { w:  480, h:  360, label: 'SD video thumbnail'        },
];

// Tolerance in pixels when matching social-media dimensions
const DIM_TOLERANCE = 4;

// ─── Aspect-ratio labelling ───────────────────────────────────────────────────

function labelAspect(w: number, h: number): string {
  if (w === 0 || h === 0) return 'unknown';
  const r = w / h;
  if (Math.abs(r - 1)    < 0.02)  return 'square_1x1';
  if (Math.abs(r - 16/9) < 0.04)  return 'landscape_16x9';
  if (Math.abs(r - 9/16) < 0.04)  return 'story_9x16';
  if (Math.abs(r - 4/5)  < 0.04)  return 'portrait_4x5';
  if (Math.abs(r - 5/4)  < 0.04)  return 'landscape_5x4';
  if (Math.abs(r - 4/3)  < 0.04)  return 'landscape_4x3';
  if (Math.abs(r - 3/4)  < 0.04)  return 'portrait_3x4';
  if (Math.abs(r - 3/2)  < 0.04)  return 'landscape_3x2';
  if (Math.abs(r - 2/3)  < 0.04)  return 'portrait_2x3';
  if (r > 2.5)                     return 'banner_wide';
  if (r < 0.4)                     return 'banner_tall';
  return 'freeform';
}

// ─── Pixel helpers ────────────────────────────────────────────────────────────

/** Mean of a Uint8Array slice */
function mean(arr: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += arr[i];
  return sum / (end - start);
}

/** Variance of a Uint8Array slice */
function variance(arr: Uint8Array, start: number, end: number): number {
  const m = mean(arr, start, end);
  let v = 0;
  for (let i = start; i < end; i++) v += (arr[i] - m) ** 2;
  return v / (end - start);
}

// ─── Main analysis ────────────────────────────────────────────────────────────

const SAFE_ZERO: VisualAnalysisResult = {
  hasUniformBorders: false, hasTextRegions: false, textCoverage: 0,
  compressionRatio: 0, isSocialMediaFormat: false, aspectCategory: 'unknown',
  noiseInconsistency: 0, editScore: 0, reasons: [],
};

export async function analyzeVisualEdits(
  buffer:   Buffer,
  width:    number,
  height:   number,
  fileSize: number,
): Promise<VisualAnalysisResult> {
  try {
    const reasons: string[] = [];

    // ── 1. Compression fingerprint ───────────────────────────────────────────
    const compressionRatio = fileSize > 0 && width > 0 && height > 0
      ? fileSize / (width * height)
      : 0;

    // ── 2. Social-media format detection ────────────────────────────────────
    const isSocialMediaFormat = SOCIAL_DIMS.some(
      (d) => Math.abs(d.w - width) <= DIM_TOLERANCE && Math.abs(d.h - height) <= DIM_TOLERANCE
    );
    const matchedSocialDim = SOCIAL_DIMS.find(
      (d) => Math.abs(d.w - width) <= DIM_TOLERANCE && Math.abs(d.h - height) <= DIM_TOLERANCE
    );
    const aspectCategory = labelAspect(width, height);

    // Also treat perfectly round / power-of-2-like dimensions as suspicious
    const isRoundDims = width % 10 === 0 && height % 10 === 0;

    // ── 3. Pixel-level analysis: downsample to max 256px ────────────────────
    const scale   = Math.max(width, height) > 256 ? 256 / Math.max(width, height) : 1;
    const anaW    = Math.max(1, Math.round(width  * scale));
    const anaH    = Math.max(1, Math.round(height * scale));

    const { data: raw } = await sharp(buffer)
      .resize(anaW, anaH)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = raw as unknown as Uint8Array;
    const total  = anaW * anaH;

    // ── 4. Border detection (top, bottom, left, right strips of 8% of dim) ──
    const rowStrip = Math.max(1, Math.round(anaH * 0.08));
    const colStrip = Math.max(1, Math.round(anaW * 0.08));

    // Top strip
    const topMean    = mean(pixels, 0, anaW * rowStrip);
    // Bottom strip
    const botMean    = mean(pixels, total - anaW * rowStrip, total);
    // Left strip (sample every row)
    let leftSum = 0, rightSum = 0, leftCount = 0;
    for (let y = 0; y < anaH; y++) {
      for (let x = 0; x < colStrip; x++) leftSum  += pixels[y * anaW + x];
      for (let x = anaW - colStrip; x < anaW; x++) rightSum += pixels[y * anaW + x];
      leftCount++;
    }
    const leftMean  = leftSum  / (leftCount  * colStrip);
    const rightMean = rightSum / (leftCount  * colStrip);

    const isBorderDark  = [topMean, botMean, leftMean, rightMean].some(m => m < 22);
    const isBorderLight = [topMean, botMean, leftMean, rightMean].some(m => m > 233);
    const hasUniformBorders = isBorderDark || isBorderLight;

    // ── 5. Text/watermark detection ──────────────────────────────────────────
    // Divide into 8×8 grid of blocks; a block is "text-like" when:
    //   a) variance is HIGH (lots of sharp edges = character strokes), AND
    //   b) bimodal: many pixels near 0 (ink) or near 255 (paper/background)
    const gridCols = 8, gridRows = 8;
    const blockW   = Math.max(1, Math.floor(anaW / gridCols));
    const blockH   = Math.max(1, Math.floor(anaH / gridRows));

    let textBlocks = 0;
    const totalBlocks = gridCols * gridRows;

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        // Extract block pixels
        const blockPixels: number[] = [];
        for (let y = gy * blockH; y < Math.min(anaH, (gy + 1) * blockH); y++) {
          for (let x = gx * blockW; x < Math.min(anaW, (gx + 1) * blockW); x++) {
            blockPixels.push(pixels[y * anaW + x]);
          }
        }
        if (blockPixels.length < 4) continue;

        const bArr = new Uint8Array(blockPixels);
        const bVar = variance(bArr, 0, bArr.length);
        const bMean = mean(bArr, 0, bArr.length);

        // Count extreme pixels (near black or near white)
        const extremeCount = blockPixels.filter(p => p < 40 || p > 215).length;
        const extremeFrac  = extremeCount / blockPixels.length;

        // High variance (sharp edges) + high fraction of extreme pixels = text-like
        if (bVar > 2000 && extremeFrac > 0.50 && (bMean < 80 || bMean > 175)) {
          textBlocks++;
        }
      }
    }
    const textCoverage    = textBlocks / totalBlocks;
    const hasTextRegions  = textCoverage >= 0.06; // at least 6% of blocks

    // ── 6. Noise inconsistency across quadrants ──────────────────────────────
    // Split image into 4 quadrants, compute local variance in each
    // High variance between quadrant-variances = inconsistent noise = compositing
    const hw = Math.floor(anaW / 2), hh = Math.floor(anaH / 2);
    const quadVariances: number[] = [];

    for (const [y0, y1, x0, x1] of [[0, hh, 0, hw], [0, hh, hw, anaW], [hh, anaH, 0, hw], [hh, anaH, hw, anaW]] as [number, number, number, number][]) {
      const q: number[] = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          q.push(pixels[y * anaW + x]);
        }
      }
      if (q.length > 0) {
        const qa = new Uint8Array(q);
        quadVariances.push(variance(qa, 0, qa.length));
      }
    }

    let noiseInconsistency = 0;
    if (quadVariances.length > 1) {
      const qMean = quadVariances.reduce((a, b) => a + b, 0) / quadVariances.length;
      const qVar  = quadVariances.reduce((s, v) => s + (v - qMean) ** 2, 0) / quadVariances.length;
      // Normalise: sqrt(qVar) / qMean capped at 1
      noiseInconsistency = qMean > 0 ? Math.min(1, Math.sqrt(qVar) / qMean) : 0;
    }

    // ── 7. Build edit score + reasons ────────────────────────────────────────
    let editScore = 0;

    if (hasTextRegions) {
      const contribution = Math.min(0.35, textCoverage * 3.0);
      editScore += contribution;
      reasons.push(`Text/watermark overlay detected (${(textCoverage * 100).toFixed(0)}% coverage)`);
    }

    if (hasUniformBorders) {
      editScore += 0.25;
      reasons.push(`Uniform ${isBorderDark ? 'dark' : 'light'} borders detected — letterboxing or padding added`);
    }

    if (isSocialMediaFormat && matchedSocialDim) {
      editScore += 0.20;
      reasons.push(`Exact ${matchedSocialDim.label} dimensions (${width}×${height}) — social media post`);
    } else if (isSocialMediaFormat) {
      editScore += 0.20;
      reasons.push(`Social media standard dimensions (${width}×${height})`);
    }

    if (compressionRatio > 0 && compressionRatio < 0.15) {
      editScore += 0.15;
      reasons.push(`Very low bytes/pixel (${compressionRatio.toFixed(3)}) — heavily compressed web image`);
    } else if (compressionRatio > 0 && compressionRatio < 0.30) {
      editScore += 0.08;
      reasons.push(`Low bytes/pixel (${compressionRatio.toFixed(3)}) — typical web/social compression`);
    }

    if (noiseInconsistency > 0.60) {
      editScore += 0.18;
      reasons.push(`Noise inconsistency ${noiseInconsistency.toFixed(2)} — different regions suggest compositing`);
    } else if (noiseInconsistency > 0.35) {
      editScore += 0.08;
      reasons.push(`Moderate noise variation across regions`);
    }

    if (isRoundDims && !isSocialMediaFormat) {
      editScore += 0.05;
      reasons.push(`Round dimensions (${width}×${height}) suggest intentional resize`);
    }

    editScore = Math.min(1, editScore);

    console.log(
      `[VisualEdit] score=${editScore.toFixed(3)} text=${textCoverage.toFixed(2)} borders=${hasUniformBorders} social=${isSocialMediaFormat} bpp=${compressionRatio.toFixed(3)} noise=${noiseInconsistency.toFixed(2)}`
    );

    return {
      hasUniformBorders,
      hasTextRegions,
      textCoverage,
      compressionRatio,
      isSocialMediaFormat,
      aspectCategory,
      noiseInconsistency,
      editScore,
      reasons,
    };

  } catch (err) {
    console.warn('[VisualEdit] analysis failed (continuing):', (err as Error).message);
    return SAFE_ZERO;
  }
}
