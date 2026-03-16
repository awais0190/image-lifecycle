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
import { faceService }                from '@/lib/services/faceService';
import type { FaceMatchLevel }        from '@/lib/services/faceService';


export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchNode {
  id:             string;
  filename:       string;
  cloudinaryUrl:  string;
  pHash:          string;
  cryptoHash:     string;
  clipEmbedding:  number[] | null;
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
  faceDetected:  boolean;
  faceCount:     number;
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
  faceMatch: {
    matchLevel:   FaceMatchLevel;
    confidence:   number;
    verified:     boolean;
    distance:     number;
    faceDetected: boolean;
  } | null;
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
  // Resolution is the most reliable signal: originals are almost always the largest.
  const pixelRatio = maxPixels > 0 ? (width * height) / maxPixels : 0.5;
  let score = pixelRatio * 0.35;                          // 35% weight on relative resolution

  score += (1 - editProbability) * 0.30;                  // 30% from ELA/EXIF edit probability

  if (camera)    score += 0.15;                           // camera EXIF → real photo, not a download
  if (!software) score += 0.10;                           // no editing software → untouched
  else           score -= 0.15;                           // editing software found → processed copy
  if (dateCreated) score += 0.05;                         // has EXIF timestamp → likely camera original

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

  // Pre-compute all pairwise similarities
  const pairSim:  number[][]          = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairClip: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const pairDist: number[][]          = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = hammingDistance(nodes[i].pHash, nodes[j].pHash);
      const clip = nodes[i].clipEmbedding && nodes[j].clipEmbedding
        ? cosineSimilarity(nodes[i].clipEmbedding!, nodes[j].clipEmbedding!)
        : null;
      const sim = combinedSimilarity(dist, clip);
      pairSim[i][j]  = pairSim[j][i]  = sim;
      pairClip[i][j] = pairClip[j][i] = clip;
      pairDist[i][j] = pairDist[j][i] = dist;
    }
  }

  // Average similarity of each node to all others (outlier detection + root selection)
  const avgSim: number[] = nodes.map((_, i) => {
    const total = nodes.reduce((sum, __, j) => i === j ? sum : sum + pairSim[i][j], 0);
    return total / (n - 1);
  });

  const avgSimilarities: Record<string, number> = {};
  nodes.forEach((node, i) => { avgSimilarities[node.id] = avgSim[i]; });

  // ── Date and resolution arrays for directionality signals ─────────────────
  // These are the most reliable "which came first" signals.
  // Date: earlier = more likely original.  Resolution: larger = more likely original.
  const timestamps: (number | null)[] = nodes.map((n) => {
    const d = n.metadata.dateCreated ? new Date(n.metadata.dateCreated).getTime() : null;
    return d && !isNaN(d) ? d : null;
  });
  const pixels: number[] = nodes.map((n) => n.metadata.width * n.metadata.height);

  const validTs    = timestamps.filter((t): t is number => t !== null);
  const minTs      = validTs.length > 1 ? Math.min(...validTs) : null;
  const maxTs      = validTs.length > 1 ? Math.max(...validTs) : null;
  const datesUseful = minTs !== null && maxTs !== null && maxTs > minTs; // only useful if images differ in date

  // Normalized date score for root selection: 1.0 = earliest (most original), 0.0 = latest
  const dateScore: number[] = timestamps.map((t) => {
    if (!datesUseful || t === null) return 0.5;
    return 1 - (t - minTs!) / (maxTs! - minTs!);
  });

  const maxPixels = Math.max(...pixels);

  // ── Root selection ─────────────────────────────────────────────────────────
  // Priority: date (strongest) → cluster centrality → originality → resolution
  // An image with the earliest date and high cluster centrality is the root.
  let rootIdx = 0;
  let bestRootScore = -Infinity;
  nodes.forEach((node, i) => {
    const resSore  = maxPixels > 0 ? pixels[i] / maxPixels : 0.5;
    const score    = avgSim[i]             * 0.40
                   + node.originalityScore * 0.20
                   + dateScore[i]          * 0.30   // date is strongest single signal
                   + resSore               * 0.10;  // higher-res images tend to be originals
    if (score > bestRootScore) { bestRootScore = score; rootIdx = i; }
  });
  const rootId = nodes[rootIdx].id;

  // ── Prim's MST with direction-aware parent selection ──────────────────────
  //
  // Step 1 (Prim's): always attach the unplaced node most connected to placed set.
  // Step 2 (direction): among placed nodes within SIM_TOLERANCE of the best
  //   similarity, pick the parent with the strongest "came before" signal:
  //   1. Earlier date (strongest)
  //   2. Higher resolution (moderate)
  //   3. Higher originality score (fallback)
  //
  // This prevents a copy from being assigned as the parent of the original even
  // when the copy happens to be slightly more similar (common after heavy edits).
  const SIM_TOLERANCE = 0.15;

  const placed = new Set<number>([rootIdx]);
  const edges: BatchEdge[] = [];

  while (placed.size < n) {
    // Step 1: find the unplaced node most connected to the placed set
    let maxConn = -Infinity, nextNode = -1;
    for (let j = 0; j < n; j++) {
      if (placed.has(j)) continue;
      let conn = -Infinity;
      for (const i of placed) { if (pairSim[i][j] > conn) conn = pairSim[i][j]; }
      if (conn > maxConn) { maxConn = conn; nextNode = j; }
    }

    // Step 2: best parent = most "upstream" placed node within similarity tolerance
    let bestSimToNext = -Infinity;
    for (const i of placed) { if (pairSim[i][nextNode] > bestSimToNext) bestSimToNext = pairSim[i][nextNode]; }

    let chosenParent = -1, chosenParentScore = -Infinity;
    const tj = timestamps[nextNode];
    const pj = pixels[nextNode];

    for (const i of placed) {
      if (pairSim[i][nextNode] < bestSimToNext * (1 - SIM_TOLERANCE)) continue;

      let parentScore = nodes[i].originalityScore; // base

      // Date signal: placed node with earlier date strongly preferred as parent
      const ti = timestamps[i];
      if (ti !== null && tj !== null && ti !== tj) {
        parentScore += ti < tj ? 0.50 : -0.50; // big push toward earlier = parent
      }

      // Resolution signal: higher-resolution placed node preferred as parent
      if (pj > 0 && pixels[i] > pj * 1.15) parentScore += 0.20;  // i is noticeably larger
      if (pj > 0 && pixels[i] < pj * 0.85) parentScore -= 0.10;  // i is noticeably smaller

      if (parentScore > chosenParentScore) {
        chosenParentScore = parentScore;
        chosenParent      = i;
      }
    }

    placed.add(nextNode);
    edges.push({
      id:               `${nodes[chosenParent].id}→${nodes[nextNode].id}`,
      parentId:         nodes[chosenParent].id,
      childId:          nodes[nextNode].id,
      pHashDistance:    pairDist[chosenParent][nextNode],
      clipSimilarity:   pairClip[chosenParent][nextNode],
      relationshipType: getRelationshipType(pairDist[chosenParent][nextNode], pairClip[chosenParent][nextNode]),
      faceMatch:        null,
    });
  }

  return { edges, rootId, avgSimilarities };
}

// ─── Analyse one image ────────────────────────────────────────────────────────

async function analyseOne(buffer: Buffer, filename: string, id: string): Promise<BatchNode> {
  // CLIP, EXIF, upload run in parallel — face detection is kept out of here
  // and run sequentially later to avoid overloading the ML service.
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
    faceDetected:  false,   // filled in sequentially after analyseOne
    faceCount:     0,
    originalityScore: 0,
    avgSimilarity:    0,
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

    // Analyse all images in parallel (CLIP + ELA + EXIF + upload only)
    const rawNodes = await Promise.all(
      buffers.map((buf, i) => analyseOne(buf, files[i].name, String(i)))
    );

    // Face detection — run one image at a time to avoid overloading DeepFace
    for (let i = 0; i < rawNodes.length; i++) {
      const result = await faceService.detectFace(buffers[i]);
      rawNodes[i].faceDetected = result?.faceDetected ?? false;
      rawNodes[i].faceCount    = result?.faceCount    ?? 0;
    }

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

    // Identify outliers BEFORE building the tree so unrelated images are excluded
    // from it entirely (only meaningful for 3+ images).
    const outlierSet = new Set<string>();
    if (nodes.length > 2) {
      const nAll = nodes.length;
      const quickSim: number[][] = Array.from({ length: nAll }, () => new Array(nAll).fill(0) as number[]);
      for (let i = 0; i < nAll; i++) {
        for (let j = i + 1; j < nAll; j++) {
          const dist = hammingDistance(nodes[i].pHash, nodes[j].pHash);
          const clip = nodes[i].clipEmbedding && nodes[j].clipEmbedding
            ? cosineSimilarity(nodes[i].clipEmbedding!, nodes[j].clipEmbedding!)
            : null;
          quickSim[i][j] = quickSim[j][i] = combinedSimilarity(dist, clip);
        }
      }
      const avgSims = nodes.map((_, i) =>
        nodes.reduce((s, __, j) => i === j ? s : s + quickSim[i][j], 0) / (nAll - 1)
      );
      const batchMean = avgSims.reduce((a, b) => a + b, 0) / nAll;
      const threshold  = batchMean * 0.60;  // >40% below mean → unrelated
      nodes.forEach((node, i) => { if (avgSims[i] < threshold) outlierSet.add(node.id); });
    }

    // Split: tree nodes go into the provenance tree; outliers are returned separately
    const nodesForTree = outlierSet.size > 0 ? nodes.filter((n) => !outlierSet.has(n.id)) : nodes;
    const outlierNodes = outlierSet.size > 0 ? nodes.filter((n) =>  outlierSet.has(n.id)) : [];

    // Build parent/child tree (cluster-aware root selection) — outliers excluded
    const { edges: rawEdges, rootId, avgSimilarities } = buildTree(nodesForTree);

    // Augment MST edges with face comparison — run sequentially, one at a time,
    // to avoid firing concurrent DeepFace requests that crash the ML service.
    const edges: BatchEdge[] = [];
    for (const edge of rawEdges) {
      const bufA = buffers[parseInt(edge.parentId)];
      const bufB = buffers[parseInt(edge.childId)];
      const faceCompare = await faceService.compareFaces(bufA, bufB);

      // Downgrade relationship type when faces are detected but don't match —
      // same logic as in /compare: different people can't be near-duplicates.
      let { relationshipType } = edge;
      if (faceCompare?.faceDetected && faceCompare.matchLevel === 'no_match') {
        if      (relationshipType === 'near-duplicate') relationshipType = 'similar';
        else if (relationshipType === 'similar')        relationshipType = 'related';
        else if (relationshipType === 'related')        relationshipType = 'different';
      }

      edges.push({
        ...edge,
        relationshipType,
        faceMatch: faceCompare ? {
          matchLevel:   faceCompare.matchLevel,
          confidence:   faceCompare.confidence,
          verified:     faceCompare.verified,
          distance:     faceCompare.distance,
          faceDetected: faceCompare.faceDetected,
        } : null,
      });
    }

    // Annotate tree nodes with parentId, childIds, depth
    for (const edge of edges) {
      const child  = nodesForTree.find((n) => n.id === edge.childId)!;
      const parent = nodesForTree.find((n) => n.id === edge.parentId)!;
      child.parentId = edge.parentId;
      parent.childIds.push(edge.childId);
    }

    // BFS to compute depths
    const depthMap = new Map<string, number>([[rootId, 0]]);
    const queue    = [rootId];
    while (queue.length > 0) {
      const pid  = queue.shift()!;
      const node = nodesForTree.find((n) => n.id === pid)!;
      for (const cid of node.childIds) {
        depthMap.set(cid, (depthMap.get(pid) ?? 0) + 1);
        queue.push(cid);
      }
    }
    nodesForTree.forEach((n) => { n.depth = depthMap.get(n.id) ?? 0; });

    // Build pairwise similarity matrix for UI — include ALL nodes (even outliers) for reference
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

    // Strip clipEmbedding from response
    const responseNodes = nodesForTree.map(({ clipEmbedding: _, ...rest }) => ({
      ...rest,
      avgSimilarity: avgSimilarities[rest.id] ?? 0,
      isOutlier:     false,
    }));

    const responseOutliers = outlierNodes.map(({ clipEmbedding: _, ...rest }) => ({
      ...rest,
      avgSimilarity: 0,
      isOutlier:     true,
    }));

    return NextResponse.json({
      status:         'success',
      processingTime: Date.now() - startTime,
      rootId,
      nodes:          responseNodes,
      outlierNodes:   responseOutliers,
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
