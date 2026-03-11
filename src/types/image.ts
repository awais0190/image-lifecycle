// ─────────────────────────────────────────────────────────────────────────────
// Image Lifecycle — TypeScript Interfaces
// Phase 01: Definitions only. Populated in Phase 02 (analysis pipeline).
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

/** Result from the ELA / forensics analysis pipeline */
export interface ForensicsResult {
  isEdited: boolean;
  editingSoftware?: string;   // detected via metadata or heuristic
  elaScore: number;           // 0–100; higher = more likely edited
  elaHeatmapUrl?: string;     // Cloudinary URL of ELA heatmap overlay
  confidence: number;         // 0–1 probability
}

/** Source reference: where this image was found on the web */
export interface ImageSource {
  url: string;
  foundAt: string;            // ISO-8601 timestamp
  platform?: string;          // e.g. "twitter", "reddit", "news"
}

/**
 * Core document stored in MongoDB.
 * Maps 1-to-1 with the ImageNode Mongoose model.
 */
export interface ImageNode {
  _id?: string;

  // ── Fingerprints ──────────────────────────────────────────
  hash: string;               // perceptual hash (pHash)
  cryptoHash: string;         // SHA-256 of raw file bytes

  // ── Embedding ─────────────────────────────────────────────
  clipEmbedding: number[];    // 512-dim CLIP vector (Phase 02)

  // ── Storage ───────────────────────────────────────────────
  cloudinaryUrl: string;
  cloudinaryPublicId: string;

  // ── Descriptive data ──────────────────────────────────────
  metadata: ImageMetadata;
  forensics: ForensicsResult;
  sources: ImageSource[];

  // ── Tree position ─────────────────────────────────────────
  parentHash: string | null;  // null = root / original image
  children: string[];         // pHash strings of child nodes
  depth: number;              // 0 = root original

  uploadedAt: Date;
}

// ── Node status union ─────────────────────────────────────────────────────────
export type NodeStatus = 'original' | 'edited' | 'uncertain' | 'duplicate';

/**
 * React Flow-compatible node shape.
 * Populated by ImageNode.toTreeNode() (Phase 03).
 */
export interface TreeNode {
  id: string;                 // pHash
  type: 'imageNode';
  position: { x: number; y: number };
  data: {
    label: string;
    imageUrl: string;
    status: NodeStatus;
    depth: number;
    metadata: ImageMetadata;
    forensics: ForensicsResult;
    isEdited: boolean;
    elaScore: number;
  };
}

/** Full response from POST /api/images/analyze */
export interface AnalysisResult {
  status: 'success' | 'error';
  node: ImageNode;
  tree: TreeNode[];           // all nodes in the lineage
  processingTime: number;     // milliseconds
  error?: string;
}

/** Lightweight upload progress / state used by UI components */
export interface UploadState {
  file: File | null;
  preview: string | null;     // object URL
  url: string;                // when using URL input mode
  isUploading: boolean;
  error: string | null;
}
