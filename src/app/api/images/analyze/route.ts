/**
 * POST /api/images/analyze
 *
 * Accepts a multipart/form-data body with either:
 *   - `file`  : binary image file
 *   - `url`   : public image URL string
 *
 * Returns: AnalysisResult JSON
 *
 * TODO Phase 02 — implement in this order:
 *   1. Parse request body (formData or JSON)
 *   2. If URL: fetch image buffer from the URL
 *   3. Compute SHA-256 (crypto) and pHash (sharp + blockhash-js or similar)
 *   4. Check MongoDB: if cryptoHash already exists → return cached tree
 *   5. Upload image to Cloudinary via uploadImage()
 *   6. Call CLIP microservice (CLIP_SERVICE_URL env var) for 512-dim embedding
 *   7. Run ELA analysis (Python sidecar or sharp manipulation)
 *   8. Determine parent node: query by pHash similarity (PHASH_SIMILAR threshold)
 *   9. Create / update ImageNode in MongoDB
 *  10. Return full tree rooted at depth-0 ancestor
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // TODO Phase 02: implement full analysis pipeline (see above)
    const body = await request.formData().catch(() => null);
    void body; // suppress unused warning until Phase 02

    return NextResponse.json(
      {
        status: 'error',
        error:  'Analysis pipeline not yet implemented. Coming in Phase 02.',
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('[/api/images/analyze]', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 500 }
    );
  }
}
