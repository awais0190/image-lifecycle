/**
 * Tree builder utilities.
 * Converts a RelationshipGraph + ImageNode records into the nested TreeJSON
 * format returned to the frontend, and computes TreeStats.
 */

import type { RelationshipGraph }    from '@/lib/services/relationshipEngine';
import type {
  TreeJSON, TreeStats, ImageNode,
  NodeStatus, ImageMetadata, ForensicsResult, ImageSource,
} from '@/types/image';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStatus(node: ImageNode, depth: number): NodeStatus {
  if (node.forensics?.isEdited)        return 'edited';
  if (depth === 0)                     return 'original';
  if ((node.forensics?.confidence ?? 0) < 0.5) return 'uncertain';
  return 'uncertain';
}

/**
 * Convert a single ImageNode (plain object from .toObject()) to a leaf TreeJSON.
 * clipEmbedding is intentionally excluded — it's 512 floats per node and would
 * bloat the tree response considerably for large trees.
 */
export function imageNodeToTreeJSON(node: ImageNode, depth: number): Omit<TreeJSON, 'children'> {
  // Strip heavyweight fields from forensics before sending to frontend
  const { signals, ...forensicsRest } = (node.forensics ?? {}) as ForensicsResult & { signals?: unknown };

  return {
    id:            node.hash,
    hash:          node.hash,
    cloudinaryUrl: node.cloudinaryUrl,
    status:        deriveStatus(node, depth),
    depth,
    metadata:      node.metadata  as ImageMetadata,
    forensics:     forensicsRest  as ForensicsResult,
    sources:       (node.sources ?? []) as ImageSource[],
  };
}

// ─── buildTreeJson ────────────────────────────────────────────────────────────

/**
 * Build a nested TreeJSON from a RelationshipGraph and a list of saved ImageNodes.
 * Nodes in the graph that have no matching ImageNode get a minimal placeholder.
 */
export function buildTreeJson(
  graph:      RelationshipGraph,
  imageNodes: ImageNode[]
): TreeJSON {
  // Index MongoDB records by pHash for O(1) lookups
  const nodeMap = new Map<string, ImageNode>();
  for (const n of imageNodes) nodeMap.set(n.hash, n);

  // Build children-list index from edges
  const childrenOf = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = childrenOf.get(edge.parentHash) ?? [];
    list.push(edge.childHash);
    childrenOf.set(edge.parentHash, list);
  }

  function buildNode(pHash: string, depth: number): TreeJSON {
    const graphNode = graph.nodes.get(pHash);
    const dbNode    = nodeMap.get(pHash);

    let partial: Omit<TreeJSON, 'children'>;

    if (dbNode) {
      partial = imageNodeToTreeJSON(dbNode, depth);
    } else if (graphNode) {
      // Fallback: use data from analyzed image (no DB record)
      const img = graphNode.image;
      partial = {
        id:            img.pHash,
        hash:          img.pHash,
        cloudinaryUrl: img.url,      // source URL as fallback
        status:        depth === 0 ? 'original' : 'uncertain',
        depth,
        metadata:      img.metadata,
        forensics: {
          isEdited:        img.editingDetection.wasEdited,
          editingSoftware: img.editingDetection.software ?? undefined,
          elaScore:        0,
          confidence:      img.editingDetection.confidence,
        },
        sources: [{ url: img.url, foundAt: img.downloadedAt.toISOString(), platform: img.platform }],
      };
    } else {
      // Ghost node — should not happen
      partial = {
        id:            pHash,
        hash:          pHash,
        cloudinaryUrl: '',
        status:        'uncertain',
        depth,
        metadata:      { width: 0, height: 0, format: '', fileSize: 0 },
        forensics:     { isEdited: false, elaScore: 0, confidence: 0 },
        sources:       [],
      };
    }

    // Build children recursively, sorted by: edited first, then depth, then hash
    const childHashes = childrenOf.get(pHash) ?? [];
    const children = childHashes
      .map((childHash) => buildNode(childHash, depth + 1))
      .sort((a, b) => {
        if (a.status === 'edited' && b.status !== 'edited') return -1;
        if (b.status === 'edited' && a.status !== 'edited') return  1;
        return a.hash.localeCompare(b.hash);
      });

    return { ...partial, children };
  }

  return buildNode(graph.rootHash, 0);
}

// ─── flattenTree ──────────────────────────────────────────────────────────────

/** Return all nodes as a flat array (breadth-first order). */
export function flattenTree(tree: TreeJSON): TreeJSON[] {
  const result: TreeJSON[] = [];
  const queue: TreeJSON[]  = [tree];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    queue.push(...node.children);
  }
  return result;
}

// ─── getTreeStats ─────────────────────────────────────────────────────────────

/** Compute aggregate statistics for a TreeJSON. */
export function getTreeStats(tree: TreeJSON): TreeStats {
  const flat = flattenTree(tree);
  const platforms = new Set<string>();

  let editedCount    = 0;
  let originalCount  = 0;
  let uncertainCount = 0;
  let maxDepth       = 0;

  for (const node of flat) {
    if (node.depth > maxDepth) maxDepth = node.depth;
    if (node.status === 'edited')    editedCount++;
    if (node.status === 'original')  originalCount++;
    if (node.status === 'uncertain' || node.status === 'duplicate') uncertainCount++;
    for (const src of node.sources) {
      if (src.platform) platforms.add(src.platform);
    }
  }

  return {
    totalNodes:    flat.length,
    editedCount,
    originalCount,
    uncertainCount,
    maxDepth,
    platforms: [...platforms],
  };
}

// ─── Single-node tree helper ──────────────────────────────────────────────────

/** Wrap a single ImageNode in a minimal TreeJSON (no children). */
export function singleNodeTree(node: ImageNode): TreeJSON {
  return { ...imageNodeToTreeJSON(node, node.depth), children: [] };
}
