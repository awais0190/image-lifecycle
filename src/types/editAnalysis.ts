// ─────────────────────────────────────────────────────────────────────────────
// editAnalysis.ts — Types for the advanced edit detection pipeline.
// Returned by POST /edit/analyze-single, /edit/analyze-comparison, /edit/quick-check
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorDetails {
  hue_shift:           number;   // degrees (0–180)
  saturation_change:   number;   // negative = desaturated, positive = boosted
  brightness_change:   number;   // negative = darkened, positive = brightened
  affected_percentage: number;   // % of pixels with noticeable colour change
  dominant_colors:     [number, number, number][];  // [R, G, B] per cluster
}

export interface ColorResult {
  color_changed:    boolean;
  confidence:       number;   // 0–1
  change_type:      'filter' | 'hue_shift' | 'desaturated' | 'brightened' | 'darkened' | 'none';
  change_intensity: number;   // 0–1
  details:          ColorDetails;
  error?:           string;
  skipped?:         boolean;
}

export interface ObjectRegion {
  type:             'added' | 'removed' | 'modified';
  area_percentage:  number;   // % of total image area
  bbox:             [number, number, number, number];  // [x, y, w, h]
  confidence:       number;
}

export interface ObjectResult {
  objects_changed:      boolean;
  copy_move_detected:   boolean;
  regions:              ObjectRegion[];
  total_changed_area:   number;   // %
  diff_heatmap_base64:  string | null;  // base64 PNG
  change_intensity:     number;  // 0–1
  error?:               string;
  skipped?:             boolean;
}

export interface FullEditReport {
  overall: {
    is_edited:  boolean;
    confidence: number;
    edit_types: string[];   // e.g. ["color_change", "object_change"]
    severity:   'none' | 'minor' | 'moderate' | 'major';
    summary:    string;     // human-readable
  };
  color:   ColorResult;
  objects: ObjectResult;
}

export interface QuickEditResult {
  is_edited:  boolean;
  edit_types: string[];
  confidence: number;
}
