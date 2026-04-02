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

export interface EditingClassifyResult {
  editProbability: number;    // 0–1 from CLIP zero-shot
  topIndicators:   string[];  // top matched editing prompts
  isEdited:        boolean;   // editProbability >= 0.55
}

export interface PartialMatchResult {
  isPartial:  boolean;
  confidence: number;
  which:      'B_in_A' | 'A_in_B' | null; // which image is inside the other
}

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

  /**
   * Zero-shot CLIP classification: is this image edited/manipulated?
   * Returns null if the ML service is unreachable.
   */
  async classifyEditing(buffer: Buffer): Promise<EditingClassifyResult | null> {
    try {
      const form = new FormData();
      form.append('file', toBlob(buffer), 'image.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/classify/editing`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        console.error('[faceService] classifyEditing non-ok:', res.status, await res.text().catch(() => ''));
        return null;
      }

      const data = await res.json() as {
        edit_probability: number; top_indicators: string[]; is_edited: boolean;
      };
      return {
        editProbability: data.edit_probability,
        topIndicators:   data.top_indicators,
        isEdited:        data.is_edited,
      };
    } catch (err) {
      console.error('[faceService] classifyEditing error:', err);
      return null;
    }
  },

  /**
   * Detect if one image is a cropped sub-region of the other.
   * Uses multi-scale template matching on the Python service.
   * Returns null if the ML service is unreachable.
   */
  async detectPartialMatch(bufferA: Buffer, bufferB: Buffer): Promise<PartialMatchResult | null> {
    try {
      const form = new FormData();
      form.append('img1', toBlob(bufferA), 'a.jpg');
      form.append('img2', toBlob(bufferB), 'b.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/image/partial-match`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        console.error('[faceService] detectPartialMatch non-ok:', res.status, await res.text().catch(() => ''));
        return null;
      }

      const data = await res.json() as { is_partial: boolean; confidence: number; which: string | null };
      return {
        isPartial:  data.is_partial,
        confidence: data.confidence,
        which:      data.which as PartialMatchResult['which'],
      };
    } catch (err) {
      console.error('[faceService] detectPartialMatch error:', err);
      return null;
    }
  },

  matchLevelLabel(level: FaceMatchLevel): string {
    if (level === 'same_person') return 'Same Person';
    if (level === 'likely_same') return 'Likely Same';
    return 'Different';
  },
};
