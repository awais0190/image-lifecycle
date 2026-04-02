/**
 * Image fingerprinting utilities.
 * Generates four fingerprint types per image:
 *
 *   1. SHA-256   — exact-match deduplication
 *   2. pHash     — 256-bit average perceptual hash (backwards compat)
 *   3. dHash     — 256-bit difference perceptual hash (more sensitive to local edits)
 *   4. CLIP      — 512-dim semantic embedding (requires microservice)
 */

import crypto from 'crypto';
import sharp  from 'sharp';
import { clipServiceClient } from '@/lib/services/clipService';

const CLIP_MAX_PX = 512;

export interface FingerprintResult {
  cryptoHash:           string;
  pHash:                string;
  dHash:                string;
  clipEmbedding:        number[] | null;
  clipServiceAvailable: boolean;
}

export async function generateFingerprints(buffer: Buffer): Promise<FingerprintResult> {
  console.log('[Fingerprint] Generating fingerprints…');

  const cryptoHash = computeCryptoHash(buffer);

  const clipBuffer = await sharp(buffer)
    .resize(CLIP_MAX_PX, CLIP_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => buffer);

  const [pHash, dHash, clipEmbedding] = await Promise.all([
    computePHash(buffer),
    computeDHash(buffer),
    clipServiceClient.getEmbedding(clipBuffer).catch(() => null),
  ]);

  const clipServiceAvailable = clipEmbedding !== null;

  console.log(`[Fingerprint] crypto: ${cryptoHash.slice(0, 12)}… pHash: ${pHash.slice(0, 12)}… dHash: ${dHash.slice(0, 12)}…`);
  console.log(`[Fingerprint] CLIP: ${clipServiceAvailable ? '512d ✓' : 'offline'}`);

  return {
    cryptoHash,
    pHash,
    dHash,
    clipEmbedding,
    clipServiceAvailable,
  };
}

function computeCryptoHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function computePHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Uint8Array);
  const mean   = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;
  return bitsToHex(pixels.map((p) => (p > mean ? 1 : 0)));
}

async function computeDHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(17, 16, { fit: 'fill' })
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Uint8Array);
  const bits: number[] = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      bits.push(pixels[row * 17 + col] > pixels[row * 17 + col + 1] ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

function bitsToHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte |= (bits[i + j] ?? 0) << (7 - j);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
