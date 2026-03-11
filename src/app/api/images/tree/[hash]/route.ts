/**
 * GET /api/images/tree/[hash]
 *
 * Returns the full provenance tree rooted at the given pHash.
 * "Root" means: walk up to the depth-0 ancestor, then collect
 * the entire subtree beneath it.
 *
 * Response shape:
 * {
 *   status: 'success',
 *   rootHash: string,
 *   nodes: TreeNode[],    // all nodes with x/y positions computed
 *   edges: { id, source, target }[]
 * }
 *
 * TODO Phase 03 — implement:
 *   1. Connect to MongoDB via connectDB()
 *   2. Find the requested node by hash
 *   3. Walk up parentHash chain to find depth-0 root
 *   4. BFS/DFS from root to collect all descendant nodes
 *   5. Call node.toTreeNode() on each document
 *   6. Run Dagre layout to assign x/y positions
 *   7. Build edges array from parentHash links
 *   8. Return full graph payload
 */

import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ hash: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;

  // TODO Phase 03: implement tree retrieval (see above)
  return NextResponse.json(
    {
      status: 'error',
      error:  `Tree retrieval not yet implemented. Requested hash: ${hash}`,
    },
    { status: 501 }
  );
}
