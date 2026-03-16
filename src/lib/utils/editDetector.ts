/**
 * editDetector.ts — Phase 05
 * Combines five signals into a single edit-probability assessment:
 *
 *   Signal 1 — EXIF software        (weight 0.15): known editor → high probability
 *   Signal 2 — ELA score            (weight 0.18): pixel artefacts → high probability
 *   Signal 3 — CLIP vs parent       (weight 0.12, optional): semantic distance
 *   Signal 4 — pHash structural     (weight 0.08, optional): same content + pixel diff
 *   Signal 5 — Pixel visual analysis(weight 0.12, optional): borders, compression
 *   Signal 6 — CLIP zero-shot edit  (weight 0.35, optional): ML editing classification
 *
 * Signal 6 (CLIP zero-shot) dominates when available — it's a real ML model that
 * understands "photo with text overlay" vs "original photograph".
 * All optional signals are skipped when unavailable; weights redistribute.
 */

import { EDIT_PROBABILITY_THRESHOLDS, ELA_THRESHOLDS } from '@/lib/utils/constants';
import type { ExtractedMetadata } from '@/lib/utils/exifExtractor';
import type { ELAResult, EditAssessment, EditSignal } from '@/types/image';
import type { VisualAnalysisResult }   from '@/lib/utils/visualEditAnalysis';
import type { EditingClassifyResult }   from '@/lib/services/faceService';

// ─── Signal scoring helpers ───────────────────────────────────────────────────

function scoreExif(meta: ExtractedMetadata): EditSignal {
  const { editingDetection } = meta;

  if (editingDetection.wasEdited) {
    return {
      score:  0.92,
      weight: 0.22,
      reason: editingDetection.software
        ? `${editingDetection.software} detected in EXIF metadata`
        : 'Editing software detected in EXIF metadata',
    };
  }

  if (meta.camera) {
    return {
      score:  0.08,
      weight: 0.22,
      reason: `Camera EXIF present (${meta.camera}), no editing software`,
    };
  }

  // No EXIF at all — previously 0.5 (too generous for stripped social media images)
  // Strip EXIF is itself a mild editing indicator; treat as slightly suspicious
  return {
    score:  0.42,
    weight: 0.22,
    reason: 'No EXIF metadata — common in social-media or processed images',
  };
}

function scoreEla(ela: ELAResult): EditSignal {
  let score: number;
  let reason: string;

  if (ela.elaScore > 0.20) {
    score  = 0.95;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — strong compression artefacts detected`;
  } else if (ela.elaScore > ELA_THRESHOLDS.LIKELY_EDITED) {
    score  = 0.65;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — moderate artefacts (threshold 0.15)`;
  } else if (ela.elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED) {
    score  = 0.32;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — minor artefacts (threshold 0.05)`;
  } else if (ela.elaScore === 0 && !ela.elaHeatmapUrl) {
    score  = 0.3;
    reason = 'ELA analysis unavailable — treating as uncertain';
  } else {
    score  = 0.05;
    reason = `ELA score ${ela.elaScore.toFixed(3)} — consistent with unmodified image`;
  }

  return { score, weight: 0.28, reason };
}

function scoreVisual(visual: VisualAnalysisResult): EditSignal {
  const topReasons = visual.reasons.slice(0, 2).join('; ') || 'No visual edit indicators found';
  return {
    score:  visual.editScore,
    weight: 0.12,   // supplementary — pixel heuristics, lower weight than CLIP
    reason: topReasons,
  };
}

/**
 * Signal 6 — CLIP zero-shot editing classification.
 *
 * CLIP compares the image against 15 "edited" prompts and 3 "original" prompts.
 * This is far more reliable than ELA or pixel heuristics because CLIP actually
 * understands "a photo with text overlay" vs "an original photograph".
 * Weight is highest (0.35) because it's a real ML model.
 */
function scoreClipEditing(result: EditingClassifyResult): EditSignal {
  const topLabel = result.topIndicators[0] ?? 'editing indicators detected';
  const reason   = result.isEdited
    ? `CLIP editing classifier: ${(result.editProbability * 100).toFixed(0)}% edit probability — "${topLabel}"`
    : `CLIP editing classifier: ${(result.editProbability * 100).toFixed(0)}% — consistent with original photograph`;
  return {
    score:  result.editProbability,
    weight: 0.35,
    reason,
  };
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

  return { score, weight: 0.22, reason };
}

/**
 * Structural signal: fires when pHash distance ≥ 8 AND CLIP similarity ≥ 0.75.
 * This pattern — same semantic content but different pixels — is the hallmark of
 * local edits: text overlays, watermarks, colour-grade changes, cropping.
 * Returns null if the preconditions aren't met (no cost to the weighted sum).
 */
function scoreStructural(
  pHashDist:  number,
  clipSim:    number | null
): EditSignal | null {
  // Require both signals present and a meaningful pHash divergence
  if (clipSim === null || pHashDist < 8) return null;
  // Only fire when content is clearly the same image (CLIP ≥ 0.75)
  if (clipSim < 0.75) return null;

  // Scale score with pHash distance: dist=8 → 0.55, dist=32 → 0.85, dist=50+ → 0.95
  const distScore = Math.min(0.95, 0.45 + (pHashDist / 64) * 0.80);
  return {
    score:  distScore,
    weight: 0.13,
    reason: `pHash dist ${pHashDist} with CLIP sim ${clipSim.toFixed(3)} — same content, localised pixel changes (text/watermark/grade)`,
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Combine EXIF, ELA, optional CLIP + structural, and optional visual signals
 * into a single edit assessment.
 *
 * @param exifResult             - EXIF metadata + editing-software detection
 * @param elaResult              - ELA compression-artifact analysis
 * @param clipSimilarityToParent - CLIP cosine similarity to parent image, or null
 * @param pHashDistFromParent    - Hamming distance from parent pHash, or null
 * @param visualResult           - Visual pixel-level analysis result, or null
 */
export function assessEditProbability(
  exifResult:              ExtractedMetadata,
  elaResult:               ELAResult,
  clipSimilarityToParent:  number | null,
  pHashDistFromParent:     number | null = null,
  visualResult:            VisualAnalysisResult | null = null,
  clipEditResult:          EditingClassifyResult | null = null,
): EditAssessment {
  const exifSignal        = scoreExif(exifResult);
  const elaSignal         = scoreEla(elaResult);
  const clipSignal        = clipSimilarityToParent !== null
    ? scoreClip(clipSimilarityToParent)
    : null;
  const structuralSignal  = scoreStructural(pHashDistFromParent ?? 0, clipSimilarityToParent);
  const visualSignal      = visualResult   !== null ? scoreVisual(visualResult)     : null;
  const clipEditSignal    = clipEditResult !== null ? scoreClipEditing(clipEditResult) : null;

  // ── Weighted sum — CLIP zero-shot is dominant when available ───────────
  let totalWeight = exifSignal.weight + elaSignal.weight;
  let weightedSum = exifSignal.score * exifSignal.weight
                  + elaSignal.score  * elaSignal.weight;

  if (clipSignal) {
    totalWeight += clipSignal.weight;
    weightedSum += clipSignal.score * clipSignal.weight;
  }
  if (structuralSignal) {
    totalWeight += structuralSignal.weight;
    weightedSum += structuralSignal.score * structuralSignal.weight;
  }
  if (visualSignal) {
    totalWeight += visualSignal.weight;
    weightedSum += visualSignal.score * visualSignal.weight;
  }
  if (clipEditSignal) {
    totalWeight += clipEditSignal.weight;
    weightedSum += clipEditSignal.score * clipEditSignal.weight;
  }

  const editProbability = Math.min(1, Math.max(0, weightedSum / totalWeight));

  // ── Verdict ────────────────────────────────────────────────────────────
  const verdict: EditAssessment['verdict'] =
    editProbability >= EDIT_PROBABILITY_THRESHOLDS.EDITED    ? 'edited'
    : editProbability >= EDIT_PROBABILITY_THRESHOLDS.UNCERTAIN ? 'uncertain'
    : 'original';

  // ── Overall confidence ─────────────────────────────────────────────────
  const scores = [
    exifSignal.score,
    elaSignal.score,
    ...(clipSignal ? [clipSignal.score] : []),
    ...(structuralSignal ? [structuralSignal.score] : []),
  ];
  const mean     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const overallConfidence = Math.max(0.2, Math.min(1, 1 - Math.sqrt(variance)));

  return {
    editProbability,
    verdict,
    verdictThresholds: {
      edited:    EDIT_PROBABILITY_THRESHOLDS.EDITED,
      uncertain: EDIT_PROBABILITY_THRESHOLDS.UNCERTAIN,
    },
    signals: {
      exif:   exifSignal,
      ela:    elaSignal,
      clip:   clipEditSignal ?? clipSignal ?? structuralSignal ?? null,  // CLIP edit takes priority in UI
      visual: visualSignal ?? null,
    },
    overallConfidence,
  };
}
