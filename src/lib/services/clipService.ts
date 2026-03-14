/**
 * clipService.ts — Phase 04
 * Typed HTTP client for the Python FastAPI CLIP microservice.
 *
 * Endpoints used:
 *   GET  /health  — liveness check
 *   POST /embed   — generate 512-dim embedding from image buffer
 *   POST /compare — cosine similarity between two pre-computed embeddings
 *   POST /analyze — embed + compare against existing embeddings in one call
 */

import { config } from '@/lib/config/env';
import { SIMILARITY_THRESHOLDS } from '@/lib/utils/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimilarityResult {
  hash:       string;
  similarity: number;
}

// ─── Pure TS cosine similarity fallback ──────────────────────────────────────

/**
 * Compute cosine similarity between two equal-length float arrays.
 * Used as fallback when the CLIP service is unavailable.
 * Returns 0 if either vector is all zeros.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const TIMEOUT_MS = 30_000;

// ─── Client ───────────────────────────────────────────────────────────────────

export const clipServiceClient = {

  /**
   * Generate a 512-dim CLIP embedding for an image buffer.
   * Retries once on timeout before returning null.
   * Returns null on any failure (service down, cold start, etc.) — never throws.
   */
  async getEmbedding(imageBuffer: Buffer): Promise<number[] | null> {
    const serviceUrl = config.clip.serviceUrl;
    if (!serviceUrl) {
      console.warn('[CLIP] CLIP_SERVICE_URL not configured — skipping embedding');
      return null;
    }

    const attempt = async (): Promise<number[] | null> => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }),
        'image.jpg'
      );

      const res = await fetchWithTimeout(
        `${serviceUrl}/embed`,
        { method: 'POST', body: formData },
        TIMEOUT_MS
      );

      if (!res.ok) {
        console.warn(`[CLIP] /embed returned ${res.status}`);
        return null;
      }

      const body = await res.json() as { embedding?: number[]; status?: string };
      if (!Array.isArray(body.embedding) || body.embedding.length !== 512) {
        console.warn('[CLIP] /embed returned unexpected shape');
        return null;
      }
      return body.embedding;
    };

    try {
      const result = await attempt();
      if (result) {
        console.log('[CLIP] Embedding: success (512 dims)');
        return result;
      }
    } catch (err) {
      const isTimeout = (err as Error).name === 'AbortError';
      console.warn(`[CLIP] /embed ${isTimeout ? 'timeout' : (err as Error).message} — retrying once`);
    }

    // One retry
    try {
      const result = await attempt();
      if (result) {
        console.log('[CLIP] Embedding: success on retry');
        return result;
      }
    } catch (err) {
      console.warn('[CLIP] Embedding failed on retry:', (err as Error).message);
    }

    console.warn('[CLIP] Embedding: failed — returning null');
    return null;
  },

  /**
   * Compute cosine similarity between two pre-computed 512-dim embeddings
   * using the service endpoint. Falls back to local cosineSimilarity on error.
   */
  async compareEmbeddings(
    embedding1: number[],
    embedding2: number[]
  ): Promise<number> {
    const serviceUrl = config.clip.serviceUrl;
    if (!serviceUrl) return cosineSimilarity(embedding1, embedding2);

    try {
      const res = await fetchWithTimeout(
        `${serviceUrl}/compare`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ embedding1, embedding2 }),
        },
        TIMEOUT_MS
      );
      if (!res.ok) return cosineSimilarity(embedding1, embedding2);

      const body = await res.json() as { similarity?: number };
      return typeof body.similarity === 'number'
        ? body.similarity
        : cosineSimilarity(embedding1, embedding2);
    } catch {
      return cosineSimilarity(embedding1, embedding2);
    }
  },

  /**
   * Find the most-similar embeddings for a query using the /analyze endpoint.
   * Sends existing_embeddings as a JSON form field.
   * Returns results sorted by similarity descending.
   * Falls back to local cosine comparison if service unavailable.
   */
  async findMostSimilar(
    queryEmbedding:      number[],
    candidateEmbeddings: Array<{ hash: string; embedding: number[] }>
  ): Promise<SimilarityResult[]> {
    if (candidateEmbeddings.length === 0) return [];

    const serviceUrl = config.clip.serviceUrl;

    // Local fallback (or when service URL is not set)
    const localFallback = (): SimilarityResult[] =>
      candidateEmbeddings
        .map((c) => ({ hash: c.hash, similarity: cosineSimilarity(queryEmbedding, c.embedding) }))
        .sort((a, b) => b.similarity - a.similarity);

    if (!serviceUrl) return localFallback();

    try {
      const formData = new FormData();
      // Send query as a pre-computed embedding via a small placeholder image is
      // impractical — use the /compare endpoint approach via local fallback instead,
      // as the Python /analyze endpoint requires an actual image file for embedding.
      // We already have the query embedding, so local cosine is the right path here.
      return localFallback();
    } catch {
      return localFallback();
    }
  },

  /**
   * Liveness check — returns true if the CLIP model is loaded and ready.
   * Returns false on any error (service down, cold start, network issue).
   */
  async healthCheck(): Promise<boolean> {
    const serviceUrl = config.clip.serviceUrl;
    if (!serviceUrl) return false;

    try {
      const res = await fetchWithTimeout(
        `${serviceUrl}/health`,
        { method: 'GET' },
        8_000   // short timeout for health checks
      );
      if (!res.ok) return false;
      const body = await res.json() as { model_loaded?: boolean };
      return body.model_loaded === true;
    } catch {
      return false;
    }
  },
};

// ─── CLIP threshold helpers ───────────────────────────────────────────────────

export function clipMatchLevel(similarity: number): 'strong' | 'weak' | 'none' {
  if (similarity >= SIMILARITY_THRESHOLDS.CLIP_STRONG) return 'strong';
  if (similarity >= SIMILARITY_THRESHOLDS.CLIP_WEAK)   return 'weak';
  return 'none';
}
