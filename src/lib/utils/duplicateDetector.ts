/**
 * Duplicate detection utilities.
 * Three-signal detection pipeline:
 *   1. cryptoHash exact match   → DUPLICATE (100% certain)
 *   2. pHash Hamming distance   → SIMILAR / UNCERTAIN
 *   3. CLIP cosine similarity   → SIMILAR / UNCERTAIN (when available)
 */

import { connectDB }           from '@/lib/db/mongodb';
import { ImageNodeModel }      from '@/lib/db/models/ImageNode';
import { cosineSimilarity }    from '@/lib/services/clipService';
import { SIMILARITY_THRESHOLDS } from '@/lib/utils/constants';
import type { ImageNode }      from '@/types/image';

// ─── Thresholds ────────────────────────────────────────────────────────────
const PHASH_SIMILAR_THRESHOLD   = 10;
const PHASH_UNCERTAIN_THRESHOLD = 20;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  status:           'duplicate' | 'similar' | 'uncertain' | 'new';
  matchedNode?:     ImageNode;
  pHashDistance?:   number;
  clipSimilarity?:  number;
  cryptoHashMatch:  boolean;
  detectionMethod:  'crypto' | 'phash' | 'clip' | 'none';
  confidence:       number;   // 0–1
}

// ─── Functions ─────────────────────────────────────────────────────────────

/**
 * Compute the Hamming distance between two equal-length hex strings.
 * XORs each byte pair and counts the set bits (popcount).
 * Returns Infinity if the strings have different lengths.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return Infinity;

  let distance = 0;
  for (let i = 0; i < hash1.length; i += 2) {
    const b1  = parseInt(hash1.slice(i, i + 2), 16);
    const b2  = parseInt(hash2.slice(i, i + 2), 16);
    let   xor = b1 ^ b2;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Check MongoDB for exact or visually similar duplicates.
 *
 * Priority order:
 *   1. cryptoHash exact match → DUPLICATE
 *   2. pHash distance  0–10   → SIMILAR  (very likely same)
 *   3. CLIP similarity > 0.80 → SIMILAR  (semantically same)
 *   4. pHash 11–20 OR CLIP 0.60–0.80 → UNCERTAIN
 *   5. Else → NEW
 */
export async function checkForDuplicates(
  cryptoHash:   string,
  pHash:        string,
  clipEmbedding: number[] | null = null
): Promise<DuplicateCheckResult> {
  console.log('[DupDetect] Checking for duplicates…');
  await connectDB();

  // ── Step 1: Exact cryptoHash match ──────────────────────────────────────
  const exactMatch = await ImageNodeModel.findOne({ cryptoHash }).lean();
  if (exactMatch) {
    console.log(`[DupDetect] Exact duplicate: ${cryptoHash.slice(0, 16)}…`);
    return {
      status:          'duplicate',
      matchedNode:     exactMatch as unknown as ImageNode,
      pHashDistance:   0,
      cryptoHashMatch: true,
      detectionMethod: 'crypto',
      confidence:      1.0,
    };
  }

  // ── Step 2: pHash Hamming-distance scan ─────────────────────────────────
  // Limit to 200 most recent nodes — adequate for dedup while keeping queries fast
  const allNodes = await ImageNodeModel
    .find(
      {},
      { hash: 1, cryptoHash: 1, clipEmbedding: 1, metadata: 1, forensics: 1,
        parentHash: 1, depth: 1, cloudinaryUrl: 1, cloudinaryPublicId: 1,
        children: 1, sources: 1, uploadedAt: 1 }
    )
    .sort({ uploadedAt: -1 })
    .limit(200)
    .lean();

  let closestNode: (typeof allNodes)[0] | null = null;
  let minDistance = Infinity;

  for (const node of allNodes) {
    const dist = hammingDistance(pHash, node.hash);
    if (dist < minDistance) {
      minDistance  = dist;
      closestNode  = node;
    }
  }

  if (closestNode !== null && minDistance <= PHASH_SIMILAR_THRESHOLD) {
    console.log(`[DupDetect] pHash similar — distance: ${minDistance}`);
    return {
      status:          'similar',
      matchedNode:     closestNode as unknown as ImageNode,
      pHashDistance:   minDistance,
      cryptoHashMatch: false,
      detectionMethod: 'phash',
      confidence:      0.85,
    };
  }

  // ── Step 3: CLIP cosine similarity (when available) ──────────────────────
  if (clipEmbedding && clipEmbedding.length === 512) {
    // Only compare against nodes that have real 512-dim embeddings stored
    // allNodes is already limited to 200 most-recent, so no further slice needed
    const candidates = allNodes.filter(
      (n) => Array.isArray(n.clipEmbedding) && (n.clipEmbedding as number[]).length === 512
    );

    let bestClipNode:   (typeof allNodes)[0] | null = null;
    let bestSimilarity = 0;

    for (const node of candidates) {
      const sim = cosineSimilarity(clipEmbedding, node.clipEmbedding as number[]);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestClipNode   = node;
      }
    }

    if (bestClipNode !== null && bestSimilarity >= SIMILARITY_THRESHOLDS.CLIP_STRONG) {
      console.log(`[DupDetect] CLIP similar — cosine: ${bestSimilarity.toFixed(3)}`);
      return {
        status:          'similar',
        matchedNode:     bestClipNode as unknown as ImageNode,
        clipSimilarity:  bestSimilarity,
        cryptoHashMatch: false,
        detectionMethod: 'clip',
        confidence:      0.80,
      };
    }

    // CLIP weak match — may also combine with uncertain pHash
    const isPhashUncertain = closestNode !== null && minDistance <= PHASH_UNCERTAIN_THRESHOLD;
    if (
      bestClipNode !== null &&
      bestSimilarity >= SIMILARITY_THRESHOLDS.CLIP_WEAK
    ) {
      const node = isPhashUncertain ? closestNode! : bestClipNode;
      console.log(`[DupDetect] CLIP weak match — cosine: ${bestSimilarity.toFixed(3)}`);
      return {
        status:          'uncertain',
        matchedNode:     node as unknown as ImageNode,
        pHashDistance:   isPhashUncertain ? minDistance : undefined,
        clipSimilarity:  bestSimilarity,
        cryptoHashMatch: false,
        detectionMethod: 'clip',
        confidence:      0.55,
      };
    }
  }

  // ── Step 4: pHash uncertain range ────────────────────────────────────────
  if (closestNode !== null && minDistance <= PHASH_UNCERTAIN_THRESHOLD) {
    console.log(`[DupDetect] Uncertain similarity — pHash distance: ${minDistance}`);
    return {
      status:          'uncertain',
      matchedNode:     closestNode as unknown as ImageNode,
      pHashDistance:   minDistance,
      cryptoHashMatch: false,
      detectionMethod: 'phash',
      confidence:      0.50,
    };
  }

  console.log('[DupDetect] No duplicates — treating as new image');
  return { status: 'new', cryptoHashMatch: false, detectionMethod: 'none', confidence: 0.95 };
}
