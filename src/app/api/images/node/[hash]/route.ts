/**
 * GET  /api/images/node/[hash]   — fetch single node by pHash
 * PATCH /api/images/node/[hash]  — update node fields (admin / correction flow)
 *
 * TODO Phase 02 — implement GET:
 *   1. connectDB()
 *   2. ImageNodeModel.findOne({ hash })
 *   3. Return 404 if not found
 *   4. Return serialized document
 *
 * TODO Phase 04 — implement PATCH:
 *   1. Validate request body with Zod
 *   2. Only allow updating: sources[], forensics.isEdited, forensics.confidence
 *   3. Record audit trail (who changed what, when)
 */

import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ hash: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;

  // TODO Phase 02: implement (see above)
  return NextResponse.json(
    {
      status: 'error',
      error:  `Node lookup not yet implemented. Requested hash: ${hash}`,
    },
    { status: 501 }
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;
  void request; // will be used in Phase 04

  // TODO Phase 04: implement partial update (see above)
  return NextResponse.json(
    {
      status: 'error',
      error:  `Node update not yet implemented. Requested hash: ${hash}`,
    },
    { status: 501 }
  );
}
