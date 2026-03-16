/**
 * Relationship engine — Phase 04.
 * Determines parent-child relationships between the root image and
 * all discovered copies, producing a directed graph.
 *
 * Scoring model (weights):
 *   Rule A — date heuristic  (0.40): later date → child of earlier image
 *   Rule B — pHash distance  (0.25): closer hash → more direct relationship
 *   Rule C — Google matchType(0.15): full/partial/similar → confidence proxy
 *   Rule D — CLIP similarity (0.20): semantic closeness (Phase 04)
 *
 * Rule D is skipped (weight redistributed) when either image lacks a CLIP embedding.
 */

import { hammingDistance }    from '@/lib/utils/duplicateDetector';
import { cosineSimilarity }   from '@/lib/services/clipService';
import type { AnalyzedImage } from '@/lib/services/batchAnalyzer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RelationshipNode {
  pHash:      string;
  image:      AnalyzedImage;
  depth:      number;
  parentHash: string | null;
}

export interface RelationshipEdge {
  parentHash: string;
  childHash:  string;
  confidence: number;
}

export interface RelationshipGraph {
  nodes:            Map<string, RelationshipNode>;  // keyed by pHash
  edges:            RelationshipEdge[];
  rootHash:         string;
  totalDepth:       number;
  confidenceScores: Map<string, number>;            // edge confidence per childHash
  clipUsed:         boolean;
  unrelated:        AnalyzedImage[];                // excluded — below affinity threshold
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DEPTH = 5;

// Images whose best affinity score to ANY node in the tree falls below this
// threshold are excluded from the tree entirely — they are unrelated images
// that Google Vision returned due to visual keyword/scene overlap, not because
// they are actually copies of the uploaded image.
// Note: 'full' matchType images bypass this threshold and are always included.
const MIN_AFFINITY_THRESHOLD = 0.28;

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function scoreByDate(
  candidateDate: string | undefined,
  parentDate:    string | undefined
): number {
  if (!candidateDate || !parentDate) return 0.5;
  const c = new Date(candidateDate).getTime();
  const p = new Date(parentDate).getTime();
  if (isNaN(c) || isNaN(p)) return 0.5;
  if (c > p) return 1.0;  // candidate is newer → likely a copy/child
  if (c < p) return 0.2;  // candidate is older → root might be the copy
  return 0.7;              // same date — probably related
}

function scoreByDistance(dist: number): number {
  if (dist <=  5) return 0.95;
  if (dist <= 15) return 0.75;
  if (dist <= 25) return 0.50;
  return 0.20;
}

function scoreByMatchType(matchType: AnalyzedImage['matchType']): number {
  if (matchType === 'full')    return 0.90;
  if (matchType === 'partial') return 0.65;
  return 0.40; // similar
}

function scoreByClip(similarity: number): number {
  if (similarity >= 0.80) return 0.85;
  if (similarity >= 0.60) return 0.50;
  return 0.15;
}

/** Weighted parent-affinity score (0–1) */
function parentAffinity(
  candidate:     AnalyzedImage,
  parent:        AnalyzedImage,
  candidateClip: number[] | null,
  parentClip:    number[] | null
): { score: number; clipUsed: boolean } {
  const dist  = hammingDistance(candidate.pHash, parent.pHash);
  const ruleA = scoreByDate(candidate.metadata.dateCreated, parent.metadata.dateCreated);
  const ruleB = scoreByDistance(dist);
  const ruleC = scoreByMatchType(candidate.matchType);

  const hasClip =
    candidateClip !== null && parentClip !== null &&
    candidateClip.length === 512 && parentClip.length === 512;

  if (hasClip) {
    const sim   = cosineSimilarity(candidateClip!, parentClip!);
    const ruleD = scoreByClip(sim);
    return { score: 0.40 * ruleA + 0.25 * ruleB + 0.15 * ruleC + 0.20 * ruleD, clipUsed: true };
  }

  // Redistribute CLIP weight proportionally to A, B, C
  return { score: 0.50 * ruleA + 0.30 * ruleB + 0.20 * ruleC, clipUsed: false };
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Build a directed relationship graph from the root image and discovered copies.
 * Root is always depth=0. Discovered images are assigned to the parent with
 * the highest affinity score. Max depth is capped at MAX_DEPTH.
 */
export function buildRelationships(
  rootImage:      AnalyzedImage,
  discovered:     AnalyzedImage[],
  clipEmbeddings: Map<string, number[]> = new Map()
): RelationshipGraph {
  console.log(
    `[RelEngine] Building relationships for ${discovered.length} discovered images…`
  );

  const nodes            = new Map<string, RelationshipNode>();
  const edges:             RelationshipEdge[]  = [];
  const confidenceScores = new Map<string, number>();
  const unrelated:         AnalyzedImage[]     = [];
  let   anyClipUsed      = false;

  nodes.set(rootImage.pHash, {
    pHash:      rootImage.pHash,
    image:      rootImage,
    depth:      0,
    parentHash: null,
  });

  const unique = new Map<string, AnalyzedImage>();
  for (const img of discovered) {
    if (!unique.has(img.pHash) && img.pHash !== rootImage.pHash) {
      unique.set(img.pHash, img);
    }
  }

  const sorted = [...unique.values()].sort(
    (a, b) => a.pHashDistance - b.pHashDistance
  );

  for (const candidate of sorted) {
    const candidateClip = clipEmbeddings.get(candidate.pHash) ?? null;

    let bestParent:  RelationshipNode | null = null;
    let bestScore  = -1;
    let bestClipUsed = false;

    for (const registeredNode of nodes.values()) {
      if (registeredNode.depth >= MAX_DEPTH) continue;
      const parentClip = clipEmbeddings.get(registeredNode.pHash) ?? null;
      const { score, clipUsed } = parentAffinity(
        candidate, registeredNode.image, candidateClip, parentClip
      );
      if (score > bestScore) {
        bestScore    = score;
        bestParent   = registeredNode;
        bestClipUsed = clipUsed;
      }
    }

    if (!bestParent) {
      bestParent = nodes.get(rootImage.pHash)!;
      bestScore  = 0.3;
    }

    // Exclude image if it has no meaningful relationship to anything in the tree.
    // 'full' matchType images are always included — Vision confirmed exact match.
    if (bestScore < MIN_AFFINITY_THRESHOLD && candidate.matchType !== 'full') {
      unrelated.push(candidate);
      console.log(
        `[RelEngine] ${candidate.pHash.slice(0, 12)}… EXCLUDED (score ${bestScore.toFixed(2)} < ${MIN_AFFINITY_THRESHOLD}, type=${candidate.matchType}) — unrelated`
      );
      continue;
    }

    if (bestClipUsed) anyClipUsed = true;

    const depth = Math.min(bestParent.depth + 1, MAX_DEPTH);
    nodes.set(candidate.pHash, {
      pHash:      candidate.pHash,
      image:      candidate,
      depth,
      parentHash: bestParent.pHash,
    });

    const confidence = Math.round(bestScore * 100) / 100;
    edges.push({ parentHash: bestParent.pHash, childHash: candidate.pHash, confidence });
    confidenceScores.set(candidate.pHash, confidence);

    console.log(
      `[RelEngine] ${candidate.pHash.slice(0, 12)}… → parent ${bestParent.pHash.slice(0, 12)}… (depth ${depth}, score ${bestScore.toFixed(2)}, CLIP: ${bestClipUsed})`
    );
  }

  const totalDepth = Math.max(0, ...[...nodes.values()].map((n) => n.depth));
  console.log(
    `[RelEngine] ${nodes.size} nodes, ${edges.length} edges, maxDepth: ${totalDepth}, clipUsed: ${anyClipUsed}, excluded: ${unrelated.length}`
  );

  return { nodes, edges, rootHash: rootImage.pHash, totalDepth, confidenceScores, clipUsed: anyClipUsed, unrelated };
}
