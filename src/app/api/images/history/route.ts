/**
 * GET /api/images/history
 *
 * Returns paginated list of ImageNodes sorted by uploadedAt desc.
 * Only root nodes (parentHash = null) are returned by default.
 *
 * Query params:
 *   page     — 1-based page number (default 1)
 *   limit    — items per page (default 20, max 50)
 *   all      — if "true", include child nodes too
 *   search   — filter by partial pHash or cryptoHash
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB }                 from '@/lib/db/mongodb';
import { ImageNodeModel }            from '@/lib/db/models/ImageNode';

export async function GET(request: NextRequest) {
  const sp    = request.nextUrl.searchParams;
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1',  10));
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)));
  const all   = sp.get('all') === 'true';
  const search = sp.get('search')?.trim() ?? '';
  const skip  = (page - 1) * limit;

  try {
    await connectDB();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (!all)    filter.parentHash = null;
    if (search)  filter.$or = [
      { hash:       { $regex: search, $options: 'i' } },
      { cryptoHash: { $regex: search, $options: 'i' } },
    ];

    const [nodes, total] = await Promise.all([
      ImageNodeModel
        .find(filter)
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-clipEmbedding')   // don't send large embedding vectors
        .lean(),
      ImageNodeModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      status: 'success',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      nodes,
    });
  } catch (error) {
    console.error('[/api/images/history] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
