/**
 * GET /api/images/tree/[hash]
 *
 * Returns the full provenance TreeJSON rooted at the depth-0 ancestor
 * of the requested pHash.
 *
 * Pipeline:
 *   1. Find the requested node
 *   2. Walk up parentHash chain to find depth-0 root
 *   3. BFS from root to collect all descendant nodes
 *   4. Build and return TreeJSON + TreeStats
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB }                 from '@/lib/db/mongodb';
import { ImageNodeModel }            from '@/lib/db/models/ImageNode';
import { buildTreeJson, getTreeStats } from '@/lib/utils/treeBuilder';
import type { ImageNode }            from '@/types/image';
import type { IImageNode }           from '@/lib/db/models/ImageNode';
import type { RelationshipGraph }    from '@/lib/services/relationshipEngine';
import type { AnalyzedImage }        from '@/lib/services/batchAnalyzer';

interface RouteParams {
  params: Promise<{ hash: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;

  if (!hash?.trim()) {
    return NextResponse.json({ error: 'Missing hash', code: 'MISSING_HASH' }, { status: 400 });
  }

  try {
    await connectDB();

    // Find requested node
    const startNode = await ImageNodeModel.findOne({ hash: hash.trim() });
    if (!startNode) {
      return NextResponse.json({ error: `Node not found: ${hash}`, code: 'NOT_FOUND' }, { status: 404 });
    }

    // Walk up to root (depth 0)
    let rootDoc = startNode;
    while (rootDoc.parentHash) {
      const parent = await ImageNodeModel.findOne({ hash: rootDoc.parentHash });
      if (!parent) break;
      rootDoc = parent;
    }

    // BFS from root to collect all descendants
    const allDocs: IImageNode[] = [];
    const queue: IImageNode[]   = [rootDoc];
    const visited                = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.hash)) continue;
      visited.add(current.hash);
      allDocs.push(current);

      if (current.children?.length > 0) {
        const childDocs = await ImageNodeModel.find({ hash: { $in: current.children } });
        queue.push(...childDocs);
      }
    }

    // Reconstruct a minimal RelationshipGraph from the DB data
    const nodes = new Map<string, { pHash: string; image: AnalyzedImage; depth: number; parentHash: string | null }>();
    const edges: RelationshipGraph['edges'] = [];

    for (const doc of allDocs) {
      nodes.set(doc.hash, {
        pHash:      doc.hash,
        image: {
          url:             doc.cloudinaryUrl,
          pHash:           doc.hash,
          cryptoHash:      doc.cryptoHash,
          metadata:        doc.metadata as unknown as AnalyzedImage['metadata'],
          editingDetection: {
            wasEdited:  (doc.forensics as unknown as { isEdited: boolean }).isEdited,
            software:   (doc.forensics as unknown as { editingSoftware?: string }).editingSoftware ?? null,
            confidence: (doc.forensics as unknown as { confidence: number }).confidence,
          },
          matchType:       'full',
          pHashDistance:   0,
          googleScore:     1,
          platform:        ((doc.sources as { platform?: string }[])?.[0]?.platform) ?? 'Unknown',
          downloadedAt:    new Date(doc.uploadedAt ?? Date.now()),
          downloadSuccess: true,
          clipEmbedding:   (doc.clipEmbedding as number[] | undefined) ?? null,
          dHash:           (doc as unknown as { dHash?: string }).dHash ?? '',
          elaScore:        (doc.forensics as unknown as { elaScore?: number }).elaScore ?? 0,
          elaHeatmapUrl:   (doc.forensics as unknown as { elaHeatmapUrl?: string }).elaHeatmapUrl ?? '',
        },
        depth:      doc.depth as unknown as number,
        parentHash: doc.parentHash as string | null,
      });

      if (doc.parentHash) {
        edges.push({ parentHash: doc.parentHash, childHash: doc.hash, confidence: 0.8 });
      }
    }

    const graph: RelationshipGraph = {
      nodes:            nodes as RelationshipGraph['nodes'],
      edges,
      rootHash:         rootDoc.hash,
      totalDepth:       Math.max(0, ...[...nodes.values()].map((n) => n.depth)),
      confidenceScores: new Map(edges.map((e) => [e.childHash, e.confidence])),
      clipUsed:         false,
      unrelated:        [],
    };

    const allNodes: ImageNode[] = allDocs.map((d) => d.toObject() as unknown as ImageNode);
    const tree  = buildTreeJson(graph, allNodes);
    const stats = getTreeStats(tree);

    return NextResponse.json({ status: 'success', rootHash: rootDoc.hash, tree, stats });
  } catch (error) {
    console.error('[/api/images/tree] error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
