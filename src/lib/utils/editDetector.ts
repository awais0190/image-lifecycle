/**
 * editDetector.ts — Phase 04
 * Combines three signals into a single edit-probability assessment:
 *
 *   Signal 1 — EXIF software (weight 0.35): known editor → high probability
 *   Signal 2 — ELA score    (weight 0.40): pixel artefacts → high probability
 *   Signal 3 — CLIP vs parent (weight 0.25, optional): semantic distance
 *
 * If CLIP similarity is unavailable, weight is redistributed proportionally.
 */

import { EDIT_PROBABILITY_THRESHOLDS, ELA_THRESHOLDS } from '@/lib/utils/constants';
import type { ExtractedMetadata } from '@/lib/utils/exifExtractor';
import type { ELAResult, EditAssessment, EditSignal } from '@/types/image';

// ─── Signal scoring helpers ───────────────────────────────────────────────────

function scoreExif(meta: ExtractedMetadata): EditSignal {
  const { editingDetection } = meta;

  if (editingDetection.wasEdited) {
    return {
      score:  0.9,
      weight: 0.35,
      reason: editingDetection.software
        ? `${editingDetection.software} detected in EXIF metadata`
        : 'Editing software detected in EXIF metadata',
    };
  }

  if (meta.camera) {
    return {
      score:  0.1,
      weight: 0.35,
      reason: `Camera EXIF present (${meta.camera}), no editing software`,
    };
  }

  // No EXIF at all — unknown provenance
  return {
    score:  0.5,
    weight: 0.35,
    reason: 'No EXIF metadata — provenance unknown',
  };
}

function scoreEla(ela: ELAResult): EditSignal {
  let score: number;
  let reason: string;

  if (ela.elaScore > 0.20) {
    score  = 0.95;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — strong compression artefacts detected`;
  } else if (ela.elaScore > ELA_THRESHOLDS.LIKELY_EDITED) {
    score  = 0.6;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — moderate artefacts (threshold 0.15)`;
  } else if (ela.elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED) {
    score  = 0.3;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — minor artefacts (threshold 0.05)`;
  } else if (ela.elaScore === 0 && !ela.elaHeatmapUrl) {
    // ELA failed / unavailable
    score  = 0.3;
    reason = 'ELA analysis unavailable — treating as uncertain';
  } else {
    score  = 0.05;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — consistent with unmodified image`;
  }

  return { score, weight: 0.40, reason };
}

function scoreClip(clipSimilarityToParent: number): EditSignal {
  let score: number;
  let reason: string;

  if (clipSimilarityToParent >= 0.95) {
    score  = 0.05;
    reason = `CLIP similarity ${clipSimilarityToParent.toFixed(3)} — nearly identical to parent`;
  } else if (clipSimilarityToParent >= 0.80) {
    score  = 0.30;
    reason = `CLIP similarity ${clipSimilarityToParent.toFixed(3)} — minor semantic differences`;
  } else if (clipSimilarityToParent >= 0.60) {
    score  = 0.70;
    reason = `CLIP similarity ${clipSimilarityToParent.toFixed(3)} — significant semantic divergence`;
  } else {
    score  = 0.90;
    reason = `CLIP similarity ${clipSimilarityToParent.toFixed(3)} — major content change vs parent`;
  }

  return { score, weight: 0.25, reason };
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Combine EXIF, ELA, and optionally CLIP into a single edit assessment.
 * Pass null for clipSimilarityToParent when CLIP data is not available
 * (root node, no parent, or CLIP service down).
 */
export function assessEditProbability(
  exifResult:                ExtractedMetadata,
  elaResult:                 ELAResult,
  clipSimilarityToParent:    number | null
): EditAssessment {
  const exifSignal = scoreExif(exifResult);
  const elaSignal  = scoreEla(elaResult);
  const clipSignal = clipSimilarityToParent !== null
    ? scoreClip(clipSimilarityToParent)
    : null;

  // ── Weighted sum ───────────────────────────────────────────────────────
  let totalWeight = exifSignal.weight + elaSignal.weight;
  let weightedSum = exifSignal.score * exifSignal.weight
                  + elaSignal.score  * elaSignal.weight;

  if (clipSignal) {
    totalWeight += clipSignal.weight;
    weightedSum += clipSignal.score * clipSignal.weight;
  }

  // Normalise (handles case where CLIP weight is absent)
  const editProbability = Math.min(1, Math.max(0, weightedSum / totalWeight));

  // ── Verdict ────────────────────────────────────────────────────────────
  const verdict: EditAssessment['verdict'] =
    editProbability >= EDIT_PROBABILITY_THRESHOLDS.EDITED    ? 'edited'
    : editProbability >= EDIT_PROBABILITY_THRESHOLDS.UNCERTAIN ? 'uncertain'
    : 'original';

  // ── Overall confidence ─────────────────────────────────────────────────
  // Higher when all signals agree; lower when they diverge
  const scores = [exifSignal.score, elaSignal.score, ...(clipSignal ? [clipSignal.score] : [])];
  const mean   = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  // Low variance = signals agree = higher confidence
  const overallConfidence = Math.max(0.2, Math.min(1, 1 - Math.sqrt(variance)));

  return {
    editProbability,
    verdict,
    verdictThresholds: {
      edited:    EDIT_PROBABILITY_THRESHOLDS.EDITED,
      uncertain: EDIT_PROBABILITY_THRESHOLDS.UNCERTAIN,
    },
    signals: {
      exif: exifSignal,
      ela:  elaSignal,
      clip: clipSignal,
    },
    overallConfidence,
  };
}
