/**
 * GET /api/health/clip
 * Reports whether the Python CLIP microservice is available and ready.
 * Called on dashboard mount to show/hide the offline warning banner.
 */

import { NextResponse }         from 'next/server';
import { clipServiceClient }    from '@/lib/services/clipService';

export async function GET() {
  const start = Date.now();
  try {
    const available = await clipServiceClient.healthCheck();
    return NextResponse.json({
      available,
      latency: Date.now() - start,
    });
  } catch {
    return NextResponse.json({ available: false, latency: Date.now() - start });
  }
}
