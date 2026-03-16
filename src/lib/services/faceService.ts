/**
 * faceService.ts — DeepFace ArcFace via the Python ML microservice.
 *
 * POST /face/detect  — single-image face detection
 * POST /face/verify  — two-image face comparison
 *
 * All methods return null on service unavailability — callers degrade gracefully.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

// ArcFace cosine distance threshold (mirrors DeepFace default)
const ARCFACE_THRESHOLD = 0.68;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaceDetectResult {
  faceDetected: boolean;
  faceCount:    number;
  confidence:   number;
}

export interface FaceCompareResult {
  distance:     number;
  verified:     boolean;
  matchLevel:   'same_person' | 'likely_same' | 'no_match';
  confidence:   number;
  faceDetected: boolean;
  model:        string;
}

export type FaceMatchLevel = FaceCompareResult['matchLevel'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBlob(b: Buffer): Blob {
  // Must declare a MIME type — FastAPI rejects application/octet-stream
  return new Blob([new Uint8Array(b)], { type: 'image/jpeg' });
}

function deriveMatchLevel(verified: boolean, distance: number): FaceMatchLevel {
  if (!verified) return 'no_match';
  return distance < ARCFACE_THRESHOLD * 0.65 ? 'same_person' : 'likely_same';
}

function deriveConfidence(distance: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - distance / ARCFACE_THRESHOLD)) * 100) / 100;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const faceService = {
  /**
   * Detect faces in a single image buffer.
   * Returns null if the ML service is unreachable.
   */
  async detectFace(buffer: Buffer): Promise<FaceDetectResult | null> {
    try {
      const form = new FormData();
      form.append('image', toBlob(buffer), 'image.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/face/detect`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.error('[faceService] detectFace non-ok:', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json() as {
        face_detected: boolean; face_count: number; confidence: number;
      };

      return {
        faceDetected: data.face_detected,
        faceCount:    data.face_count,
        confidence:   data.confidence,
      };
    } catch (err) {
      console.error('[faceService] detectFace error:', err);
      return null;
    }
  },

  /**
   * Verify faces in two image buffers via POST /face/verify.
   * Returns null if the ML service is unreachable or returns an error.
   */
  async compareFaces(bufferA: Buffer, bufferB: Buffer): Promise<FaceCompareResult | null> {
    try {
      const form = new FormData();
      form.append('img1', toBlob(bufferA), 'a.jpg');
      form.append('img2', toBlob(bufferB), 'b.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/face/verify`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        console.error('[faceService] compareFaces non-ok:', res.status, await res.text().catch(() => ''));
        return null;
      }

      const data = await res.json() as {
        verified: boolean; distance: number;
        model: string; face_detected: boolean;
      };

      return {
        distance:     data.distance,
        verified:     data.verified,
        matchLevel:   deriveMatchLevel(data.verified, data.distance),
        confidence:   deriveConfidence(data.distance),
        faceDetected: data.face_detected,
        model:        data.model,
      };
    } catch (err) {
      console.error('[faceService] compareFaces error:', err);
      return null;
    }
  },

  matchLevelLabel(level: FaceMatchLevel): string {
    if (level === 'same_person') return 'Same Person';
    if (level === 'likely_same') return 'Likely Same';
    return 'Different';
  },
};
