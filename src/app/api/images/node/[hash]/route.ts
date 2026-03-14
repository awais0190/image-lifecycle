/**
 * GET  /api/images/node/[hash]   — fetch single ImageNode by pHash
 * PATCH /api/images/node/[hash]  — update node fields (admin / correction flow)
 *
 * TODO Phase 04 — implement PATCH:
 *   1. Validate request body with Zod
 *   2. Only allow updating: sources[], forensics.isEdited, forensics.confidence
 *   3. Record audit trail (who changed what, when)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB }                 from '@/lib/db/mongodb';
import { ImageNodeModel }            from '@/lib/db/models/ImageNode';

interface RouteParams {
  params: Promise<{ hash: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;

  if (!hash?.trim()) {
    return NextResponse.json(
      { error: 'Missing hash parameter', code: 'MISSING_HASH' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const node = await ImageNodeModel.findOne({ hash: hash.trim() });

    if (!node) {
      return NextResponse.json(
        { error: `Node not found: ${hash}`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: 'success', node: node.toObject() });
  } catch (error) {
    console.error('[/api/images/node] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { hash } = await params;
  void request; // will be used in Phase 04

  // TODO Phase 04: implement partial update (see file header)
  return NextResponse.json(
    {
      status: 'error',
      error:  `Node update not yet implemented. Requested hash: ${hash}`,
    },
    { status: 501 }
  );
}
