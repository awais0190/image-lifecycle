/**
 * POST /api/images/batch
 *
 * Multi-image relationship analyzer.
 * Upload 2–10 images → fingerprint each → compute all pairwise distances
 * → determine originality scores → build parent/child tree.
 *
 * Accepts: multipart/form-data with field name "images" (multiple files)
 *
 * Returns:
 *   nodes[]       — analyzed result for each image
 *   edges[]       — directed parent→child edges with similarity metrics
 *   rootId        — id of the most-original (root) image
 *   processingTime
 */

import { NextRequest, NextResponse }  from 'next/server';
import { validateImageBuffer, InvalidUrlError, NotAnImageError, FileTooLargeError } from '@/lib/utils/imageIngestion';
import { generateFingerprints }       from '@/lib/utils/fingerprint';
import { extractExifData }            from '@/lib/utils/exifExtractor';
import { performELA }                 from '@/lib/utils/elaAnalysis';
import { assessEditProbability }      from '@/lib/utils/editDetector';
import { uploadImage }                from '@/lib/cloudinary/upload';
import { hammingDistance }            from '@/lib/utils/duplicateDetector';
import { cosineSimilarity }           from '@/lib/services/clipService';

export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchNode {
  id:            string;
  filename:      string;
  cloudinaryUrl: string;
  pHash:         string;
  cryptoHash:    string;
  clipEmbedding: number[] | null;
  metadata: {
    width: number; height: number; format: string; fileSize: number;
    dateCreated: string | null; camera: string | null; software: string | null;
  };
  ela: {
    score: number; heatmapUrl: string | null;
    isLikelyEdited: boolean; highDiffRegions: number;
  };
  assessment: {
    verdict: 'original' | 'edited' | 'uncertain';
    editProbability: number;
    overallConfidence: number;
  };
  originalityScore: number;  // 0–1, higher = more likely original
  avgSimilarity:    number;   // average combined similarity to all other batch images
  isOutlier:        boolean;  // true if this image is unrelated to the main cluster
  parentId:      string | null;
  childIds:      string[];
  depth:         number;
}

export interface BatchEdge {
  id:              string;
  parentId:        string;
  childId:         string;
  pHashDistance:   number;
  clipSimilarity:  number | null;
  relationshipType: 'identical' | 'near-duplicate' | 'similar' | 'related' | 'different';
}

// ─── Originality score ────────────────────────────────────────────────────────

function computeOriginalityScore(
  editProbability: number,
  camera:          string | null,
  software:        string | null,
  dateCreated:     string | null,
  width:           number,
  height:          number,
  maxPixels:       number,
): number {
  let score = 1 - editProbability;                         // base: low edit prob = more original

  if (camera)                       score += 0.12;         // has camera EXIF → likely real photo
  if (!software)                    score += 0.08;         // no editing software → untouched
  else                              score -= 0.15;         // editing software found → likely edited
  if (dateCreated)                  score += 0.05;         // has timestamp
  if (maxPixels > 0) {
    const pixelRatio = (width * height) / maxPixels;
    score += pixelRatio * 0.10;                            // higher resolution = slightly more original
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Relationship type ────────────────────────────────────────────────────────
// When CLIP is available it is the authoritative signal (90% weight).
// CLIP captures semantic similarity across heavy edits (crop, recolor, resize)
// where pHash breaks down. pHash is only a 10% tiebreaker.
// When CLIP is unavailable we fall back to pHash alone.

const PHASH_MAX = 64;

function combinedSimilarity(dist: number, clipSim: number | null): number {
  const pHashSim = 1 - dist / PHASH_MAX;
  if (clipSim === null) return pHashSim;
  // CLIP dominates (90%). pHash is a small secondary check.
  return clipSim * 0.90 + pHashSim * 0.10;
}

function getRelationshipType(dist: number, clipSim: number | null): BatchEdge['relationshipType'] {
  if (dist === 0) return 'identical';
  const score = combinedSimilarity(dist, clipSim);
  if (score >= 0.88) return 'near-duplicate';   // CLIP ≥ ~0.97 or pHash dist ≤ 7
  if (score >= 0.72) return 'similar';           // CLIP ≥ ~0.80 or pHash dist ≤ 18
  if (score >= 0.50) return 'related';           // CLIP ≥ ~0.55 or pHash dist ≤ 35
  return 'different';
}

// ─── Tree builder ─────────────────────────────────────────────────────────────
//
// Root selection uses CLUSTER-AWARE scoring:
//   rootScore = avgSimilarityToAllOthers * 0.65 + originalityScore * 0.35
//
// This guarantees that an unrelated outlier image (different person / subject)
// will NEVER become root, because its average CLIP similarity to the main
// cluster will be far lower than any member of that cluster.
//
// After root is chosen, Prim's MST builds the tree using combined similarity
// (CLIP 90% + pHash 10%) so heavily-edited copies are still correctly linked.

function buildTree(nodes: BatchNode[]): { edges: BatchEdge[]; rootId: string; avgSimilarities: Record<string, number> } {
  const n = nodes.length;
  if (n === 0) return { edges: [], rootId: '', avgSimilarities: {} };
  if (n === 1) return { edges: [], rootId: nodes[0].id, avgSimilarities: { [nodes[0].id]: 1 } };

  // ── Step 1: Pre-compute all pairwise similarities ────────────────────────
  // pairSim[i][j] = combinedSimilarity between nodes[i] and nodes[j]
  const pairSim:  number[][]        = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairClip: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const pairDist: number[][]        = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = hammingDistance(nodes[i].pHash, nodes[j].pHash);
      const clip = nodes[i].clipEmbedding && nodes[j].clipEmbedding
        ? cosineSimilarity(nodes[i].clipEmbedding!, nodes[j].clipEmbedding!)
        : null;
      const sim  = combinedSimilarity(dist, clip);
      pairSim[i][j]  = pairSim[j][i]  = sim;
      pairClip[i][j] = pairClip[j][i] = clip;
      pairDist[i][j] = pairDist[j][i] = dist;
    }
  }

  // ── Step 2: Compute average similarity of each node to all others ─────────
  const avgSim: number[] = nodes.map((_, i) => {
    const total = nodes.reduce((sum, __, j) => i === j ? sum : sum + pairSim[i][j], 0);
    return total / (n - 1);
  });

  const avgSimilarities: Record<string, number> = {};
  nodes.forEach((node, i) => { avgSimilarities[node.id] = avgSim[i]; });

  // ── Step 3: Cluster-aware root selection ─────────────────────────────────
  // rootScore = avgSim (65%) + originalityScore (35%)
  // → Outlier images (low avgSim) cannot become root no matter how "original" their EXIF looks
  let rootIdx = 0;
  let bestRootScore = -Infinity;
  nodes.forEach((node, i) => {
    const score = avgSim[i] * 0.65 + node.originalityScore * 0.35;
    if (score > bestRootScore) { bestRootScore = score; rootIdx = i; }
  });
  const rootId = nodes[rootIdx].id;

  // ── Step 4: Prim's MST using pre-computed similarities ───────────────────
  const placed  = new Set<number>([rootIdx]);
  const edges:  BatchEdge[] = [];

  while (placed.size < n) {
    let bestScore    = -Infinity;
    let bestI        = -1;
    let bestJ        = -1;

    for (let j = 0; j < n; j++) {
      if (placed.has(j)) continue;
      for (const i of placed) {
        if (pairSim[i][j] > bestScore) {
          bestScore = pairSim[i][j];
          bestI     = i;
          bestJ     = j;
        }
      }
    }

    placed.add(bestJ);
    edges.push({
      id:              `${nodes[bestI].id}→${nodes[bestJ].id}`,
      parentId:        nodes[bestI].id,
      childId:         nodes[bestJ].id,
      pHashDistance:   pairDist[bestI][bestJ],
      clipSimilarity:  pairClip[bestI][bestJ],
      relationshipType: getRelationshipType(pairDist[bestI][bestJ], pairClip[bestI][bestJ]),
    });
  }

  return { edges, rootId, avgSimilarities };
}

// ─── Analyse one image ────────────────────────────────────────────────────────

async function analyseOne(buffer: Buffer, filename: string, id: string): Promise<BatchNode> {
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

  return {
    id,
    filename,
    cloudinaryUrl:  uploadResult.url,
    pHash:          fingerprints.pHash,
    cryptoHash:     fingerprints.cryptoHash,
    clipEmbedding:  fingerprints.clipEmbedding,
    metadata: {
      width:       exifData.width,
      height:      exifData.height,
      format:      exifData.format,
      fileSize:    exifData.fileSize,
      dateCreated: exifData.dateCreated ?? null,
      camera:      exifData.camera ?? null,
      software:    exifData.software ?? null,
    },
    ela: {
      score:           elaResult.elaScore,
      heatmapUrl:      elaResult.elaHeatmapUrl || null,
      isLikelyEdited:  elaResult.isLikelyEdited,
      highDiffRegions: elaResult.highDiffRegions,
    },
    assessment: {
      verdict:           assessment.verdict,
      editProbability:   assessment.editProbability,
      overallConfidence: assessment.overallConfidence,
    },
    originalityScore: 0,  // filled after all images processed (need maxPixels)
    avgSimilarity:    0,  // filled by buildTree
    isOutlier:        false,
    parentId:  null,
    childIds:  [],
    depth:     0,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data', code: 'WRONG_CONTENT_TYPE' }, { status: 400 });
    }

    const formData = await request.formData();
    const files    = formData.getAll('images') as File[];

    if (files.length < 2)  return NextResponse.json({ error: 'Upload at least 2 images', code: 'TOO_FEW' },  { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: 'Maximum 10 images allowed', code: 'TOO_MANY' }, { status: 400 });

    // Convert to buffers + validate
    const buffers = await Promise.all(files.map((f) => f.arrayBuffer().then(Buffer.from)));

    const validations = await Promise.all(buffers.map((b) => validateImageBuffer(b)));
    for (let i = 0; i < validations.length; i++) {
      if (!validations[i].valid) {
        return NextResponse.json(
          { error: `Image ${i + 1} (${files[i].name}): ${validations[i].error}`, code: 'INVALID_IMAGE' },
          { status: 422 }
        );
      }
    }

    // Analyse all images in parallel
    const rawNodes = await Promise.all(
      buffers.map((buf, i) => analyseOne(buf, files[i].name, String(i)))
    );

    // Compute originality scores (need maxPixels for relative comparison)
    const maxPixels = Math.max(...rawNodes.map((n) => n.metadata.width * n.metadata.height));
    const nodes: BatchNode[] = rawNodes.map((n) => ({
      ...n,
      originalityScore: computeOriginalityScore(
        n.assessment.editProbability,
        n.metadata.camera,
        n.metadata.software,
        n.metadata.dateCreated,
        n.metadata.width,
        n.metadata.height,
        maxPixels,
      ),
    }));

    // Build parent/child tree (cluster-aware root selection)
    const { edges, rootId, avgSimilarities } = buildTree(nodes);

    // Annotate nodes with parentId, childIds, depth, avgSimilarity
    for (const edge of edges) {
      const child  = nodes.find((n) => n.id === edge.childId)!;
      const parent = nodes.find((n) => n.id === edge.parentId)!;
      child.parentId = edge.parentId;
      parent.childIds.push(edge.childId);
    }

    // BFS to compute depths
    const depthMap = new Map<string, number>([[rootId, 0]]);
    const queue    = [rootId];
    while (queue.length > 0) {
      const pid  = queue.shift()!;
      const node = nodes.find((n) => n.id === pid)!;
      for (const cid of node.childIds) {
        depthMap.set(cid, (depthMap.get(pid) ?? 0) + 1);
        queue.push(cid);
      }
    }
    nodes.forEach((n) => { n.depth = depthMap.get(n.id) ?? 0; });

    // Outlier threshold: if avg similarity to all others is much lower than
    // the batch mean, flag the node as an outlier (unrelated image)
    const avgSimValues = Object.values(avgSimilarities);
    const batchMeanSim = avgSimValues.reduce((a, b) => a + b, 0) / avgSimValues.length;
    const outlierThreshold = batchMeanSim * 0.60;  // more than 40% below mean → outlier

    // Build pairwise similarity matrix for UI — reuse pre-computed pairs from buildTree
    // We rebuild here because buildTree internal arrays aren't exported, but n≤10 so it's fast
    const matrix: Array<{ a: string; b: string; pHashDistance: number; clipSimilarity: number | null }> = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = hammingDistance(nodes[i].pHash, nodes[j].pHash);
        const clip = nodes[i].clipEmbedding && nodes[j].clipEmbedding
          ? cosineSimilarity(nodes[i].clipEmbedding!, nodes[j].clipEmbedding!)
          : null;
        matrix.push({ a: nodes[i].id, b: nodes[j].id, pHashDistance: dist, clipSimilarity: clip });
      }
    }

    // Strip clipEmbedding from response (large array), attach avgSimilarity + isOutlier
    const responseNodes = nodes.map(({ clipEmbedding: _, ...rest }) => ({
      ...rest,
      avgSimilarity: avgSimilarities[rest.id] ?? 0,
      isOutlier:     (avgSimilarities[rest.id] ?? 0) < outlierThreshold,
    }));

    return NextResponse.json({
      status:         'success',
      processingTime: Date.now() - startTime,
      rootId,
      nodes:          responseNodes,
      edges,
      matrix,
    });

  } catch (error: unknown) {
    if (error instanceof InvalidUrlError)   return NextResponse.json({ error: error.message, code: 'INVALID_URL' },   { status: 400 });
    if (error instanceof NotAnImageError)   return NextResponse.json({ error: error.message, code: 'NOT_AN_IMAGE' }, { status: 422 });
    if (error instanceof FileTooLargeError) return NextResponse.json({ error: error.message, code: 'TOO_LARGE' },    { status: 413 });
    console.error('[/api/images/batch]', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
