// ─────────────────────────────────────────────────────────────────────────────
// Image Lifecycle — TypeScript Interfaces
// Phase 01: Core types. Phase 02: Analysis pipeline. Phase 03: Tree + Vision.
// Phase 04: CLIP embedding, ELA forensics, edit assessment.
// ─────────────────────────────────────────────────────────────────────────────

/** Raw EXIF / file metadata extracted from an image */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;           // e.g. "jpeg", "png", "webp"
  fileSize: number;         // bytes
  dateCreated?: string;     // ISO-8601 string or EXIF date
  camera?: string;          // e.g. "Apple iPhone 15 Pro"
  software?: string;        // e.g. "Adobe Photoshop 25.0"
  gps?: {
    lat: number;
    lng: number;
  };
}

// ── Phase 04 types ────────────────────────────────────────────────────────────

/** One signal contributing to the edit probability assessment */
export interface EditSignal {
  score:  number;   // 0–1 editing likelihood for this signal
  weight: number;   // how much this signal counts toward overall
  reason: string;   // human-readable explanation
}

/** Combined edit-probability result from all available signals */
export interface EditAssessment {
  editProbability: number;   // 0–1 weighted combination
  verdict: 'original' | 'edited' | 'uncertain';
  verdictThresholds: { edited: number; uncertain: number };
  signals: {
    exif: EditSignal;
    ela:  EditSignal;
    clip: EditSignal | null;
  };
  overallConfidence: number; // 0–1
}

/** Result from the ELA pixel-comparison pipeline */
export interface ELAResult {
  elaScore:           number;   // 0–1 normalised mean pixel diff
  elaHeatmapUrl:      string;   // Cloudinary URL of heatmap PNG
  elaHeatmapPublicId: string;
  isLikelyEdited:     boolean;  // elaScore > 0.15
  confidence:         number;   // 0–1
  highDiffRegions:    number;   // pixel count with amplified diff > 50
  analysisTime:       number;   // ms
}

/** Result from the ELA / forensics analysis pipeline */
export interface ForensicsResult {
  isEdited:         boolean;
  editingSoftware?: string;   // detected via metadata or heuristic
  elaScore:         number;   // 0–1 (Phase 04: real value; previously 0)
  elaHeatmapUrl?:   string;   // Cloudinary URL of ELA heatmap overlay
  confidence:       number;   // 0–1 probability
  // Phase 04 additions
  editProbability?: number;               // 0–1 combined signal
  editVerdict?:     'original' | 'edited' | 'uncertain';
  signals?: {
    exif?: EditSignal;
    ela?:  EditSignal;
    clip?: EditSignal | null;
  };
}

/** Source reference: where this image was found on the web */
export interface ImageSource {
  url:       string;
  foundAt:   string;            // ISO-8601 timestamp
  platform?: string;            // e.g. "twitter", "reddit", "news"
}

/**
 * Core document stored in MongoDB.
 * Maps 1-to-1 with the ImageNode Mongoose model.
 */
export interface ImageNode {
  _id?: string;

  // ── Fingerprints ──────────────────────────────────────────
  hash:       string;               // perceptual hash (pHash)
  cryptoHash: string;               // SHA-256 of raw file bytes

  // ── Embedding ─────────────────────────────────────────────
  clipEmbedding: number[];          // 512-dim CLIP vector (Phase 04)

  // ── Storage ───────────────────────────────────────────────
  cloudinaryUrl:      string;
  cloudinaryPublicId: string;

  // ── Descriptive data ──────────────────────────────────────
  metadata:  ImageMetadata;
  forensics: ForensicsResult;
  sources:   ImageSource[];

  // ── Tree position ─────────────────────────────────────────
  parentHash: string | null;  // null = root / original image
  children:   string[];       // pHash strings of child nodes
  depth:      number;         // 0 = root original

  uploadedAt: Date;
}

// ── Node status union ─────────────────────────────────────────────────────────
export type NodeStatus = 'original' | 'edited' | 'uncertain' | 'duplicate';

/**
 * React Flow-compatible flat node shape used internally by TreeCanvas.
 */
export interface TreeNode {
  id:   string;
  type: 'imageNode';
  position: { x: number; y: number };
  data: {
    label:     string;
    imageUrl:  string;
    status:    NodeStatus;
    depth:     number;
    metadata:  ImageMetadata;
    forensics: ForensicsResult;
    isEdited:  boolean;
    elaScore:  number;
    treeNode?: TreeJSON;
  };
}

// ── Phase 03 types ────────────────────────────────────────────────────────────

/** Single result from Google Vision Web Detection */
export interface WebSearchResult {
  url:       string;
  matchType: 'full' | 'partial' | 'similar';
  score:     number;
  pageUrl?:  string;
  platform?: string;
}

/**
 * Nested tree node for the full provenance lineage.
 * Returned by POST /api/images/analyze and GET /api/images/tree/[hash].
 */
export interface TreeJSON {
  id:           string;
  hash:         string;
  cloudinaryUrl: string;
  status:       NodeStatus;
  depth:        number;
  metadata:     ImageMetadata;
  forensics:    ForensicsResult;
  sources:      ImageSource[];
  children:     TreeJSON[];
}

/** Tree-level statistics returned alongside TreeJSON */
export interface TreeStats {
  totalNodes:    number;
  editedCount:   number;
  originalCount: number;
  uncertainCount: number;
  maxDepth:      number;
  platforms:     string[];
}

/** Full response from POST /api/images/analyze */
export interface AnalysisResult {
  status:          'success' | 'duplicate' | 'similar' | 'uncertain' | 'error';
  node:            ImageNode;
  tree:            TreeJSON;
  stats:           TreeStats;
  processingTime:  number;
  discoveredCount: number;
  error?:          string;
}

/** Lightweight upload progress / state used by UI components */
export interface UploadState {
  file:        File | null;
  preview:     string | null;
  url:         string;
  isUploading: boolean;
  error:       string | null;
}
