/**
 * Image fingerprinting utilities — Phase 04.
 * Generates SHA-256 (crypto hash), perceptual hash (pHash), and CLIP embedding.
 * Buffers stay in memory — no disk I/O.
 */

import crypto from 'crypto';
import sharp  from 'sharp';
import { clipServiceClient } from '@/lib/services/clipService';

/** Max pixel dimension sent to CLIP — full-res is unnecessary and slow */
const CLIP_MAX_PX = 512;

export interface FingerprintResult {
  /** SHA-256 hex digest of the raw file bytes (exact-match deduplication) */
  cryptoHash: string;
  /** 64-character hex perceptual hash (256-bit block hash for visual similarity) */
  pHash: string;
  /** 512-dim CLIP embedding, or null if service unavailable */
  clipEmbedding: number[] | null;
  /** Whether the CLIP service responded successfully */
  clipServiceAvailable: boolean;
}

/**
 * Generate SHA-256, perceptual hash, and CLIP embedding for an image buffer.
 * CLIP failure is non-fatal — pipeline continues with clipEmbedding = null.
 */
export async function generateFingerprints(buffer: Buffer): Promise<FingerprintResult> {
  console.log('[Fingerprint] Generating fingerprints…');

  const cryptoHash = computeCryptoHash(buffer);
  const pHash      = await computePHash(buffer);

  // Resize to max 512px before CLIP — large images waste bandwidth, CLIP needs ~224px
  const clipBuffer = await sharp(buffer)
    .resize(CLIP_MAX_PX, CLIP_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => buffer);  // fallback to original on sharp error

  const clipEmbedding        = await clipServiceClient.getEmbedding(clipBuffer);
  const clipServiceAvailable = clipEmbedding !== null;

  console.log(`[Fingerprint] cryptoHash: ${cryptoHash.slice(0, 16)}…`);
  console.log(`[Fingerprint] pHash:      ${pHash.slice(0, 16)}…`);
  console.log(`[Fingerprint] CLIP: ${clipServiceAvailable ? 'success (512 dims)' : 'failed — degraded mode'}`);

  return { cryptoHash, pHash, clipEmbedding, clipServiceAvailable };
}

/**
 * Compute SHA-256 hash of raw file bytes.
 * Returns a 64-character lowercase hex string.
 */
function computeCryptoHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute a 256-bit perceptual hash as a 64-character hex string.
 *
 * Algorithm (block/average hash):
 *   1. Resize image to 16×16 pixels with forced aspect fill
 *   2. Convert to grayscale
 *   3. Compute the mean pixel value
 *   4. For each pixel: 1 if > mean, 0 otherwise → 256 bits
 *   5. Pack bits into bytes → 32 bytes → 64 hex chars
 */
async function computePHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Uint8Array);
  const mean   = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;
  const bits   = pixels.map((p) => (p > mean ? 1 : 0));

  let hex = '';
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte |= (bits[i + j] ?? 0) << (7 - j);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
