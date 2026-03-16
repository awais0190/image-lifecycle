/**
 * editAnalysisService.ts — Client for the advanced edit detection endpoints.
 *
 * POST /edit/analyze-single    → FullEditReport (single image, colour analysis)
 * POST /edit/analyze-comparison → FullEditReport (two images, colour + diff heatmap)
 * POST /edit/quick-check       → QuickEditResult (fast, colour only)
 */

import type { FullEditReport, QuickEditResult } from '@/types/editAnalysis';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

function toBlob(b: Buffer): Blob {
  return new Blob([new Uint8Array(b)], { type: 'image/jpeg' });
}

export const editAnalysisService = {
  /**
   * Analyse a single image for colour manipulation signs.
   * Returns null if the ML service is unreachable.
   */
  async analyzeEditsSingle(buffer: Buffer): Promise<FullEditReport | null> {
    try {
      const form = new FormData();
      form.append('image', toBlob(buffer), 'image.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/edit/analyze-single`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        console.error('[editAnalysisService] analyze-single non-ok:', res.status);
        return null;
      }
      return await res.json() as FullEditReport;
    } catch (err) {
      console.error('[editAnalysisService] analyzeEditsSingle error:', err);
      return null;
    }
  },

  /**
   * Compare two images — returns colour + object-diff analysis with heatmap.
   * buffer1 is the reference (original), buffer2 is the version under examination.
   * Returns null if the ML service is unreachable.
   */
  async analyzeEditsComparison(
    buffer1: Buffer,
    buffer2: Buffer,
  ): Promise<FullEditReport | null> {
    try {
      const form = new FormData();
      form.append('image1', toBlob(buffer1), 'original.jpg');
      form.append('image2', toBlob(buffer2), 'modified.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/edit/analyze-comparison`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(45_000),
      });

      if (!res.ok) {
        console.error('[editAnalysisService] analyze-comparison non-ok:', res.status);
        return null;
      }
      return await res.json() as FullEditReport;
    } catch (err) {
      console.error('[editAnalysisService] analyzeEditsComparison error:', err);
      return null;
    }
  },

  /**
   * Fast colour-only check between two images (no heatmap, < 1 s).
   * Returns null if the ML service is unreachable.
   */
  async quickEditCheck(
    buffer1: Buffer,
    buffer2: Buffer,
  ): Promise<QuickEditResult | null> {
    try {
      const form = new FormData();
      form.append('image1', toBlob(buffer1), 'original.jpg');
      form.append('image2', toBlob(buffer2), 'modified.jpg');

      const res = await fetch(`${ML_SERVICE_URL}/edit/quick-check`, {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.error('[editAnalysisService] quick-check non-ok:', res.status);
        return null;
      }
      return await res.json() as QuickEditResult;
    } catch (err) {
      console.error('[editAnalysisService] quickEditCheck error:', err);
      return null;
    }
  },
};
