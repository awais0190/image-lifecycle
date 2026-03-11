// ─────────────────────────────────────────────────────────────────────────────
// Image Lifecycle — Application Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Hamming-distance thresholds for perceptual hash comparison */
export const SIMILARITY_THRESHOLDS = {
  /** pHash distance ≤ this → treat as exact duplicate */
  PHASH_EXACT: 10,
  /** pHash distance ≤ this → treat as visually similar */
  PHASH_SIMILAR: 20,
  /** CLIP cosine similarity ≥ this → strong semantic match */
  CLIP_STRONG: 0.80,
  /** CLIP cosine similarity ≥ this → weak / potential match */
  CLIP_WEAK: 0.60,
} as const;

/** Node status identifiers used throughout the tree */
export const NODE_STATUS = {
  ORIGINAL:  'original',
  EDITED:    'edited',
  UNCERTAIN: 'uncertain',
  DUPLICATE: 'duplicate',
} as const;

export type NodeStatusKey = keyof typeof NODE_STATUS;
export type NodeStatusValue = (typeof NODE_STATUS)[NodeStatusKey];

/** Hex color for each node status — used in badges, React Flow nodes, etc. */
export const STATUS_COLORS: Record<NodeStatusValue, string> = {
  original:  '#1E8449',
  edited:    '#e74c3c',
  uncertain: '#f39c12',
  duplicate: '#8892a4',
} as const;

/** Human-readable label for each node status */
export const STATUS_LABELS: Record<NodeStatusValue, string> = {
  original:  'Original',
  edited:    'Edited',
  uncertain: 'Uncertain',
  duplicate: 'Duplicate',
} as const;

/** Max image upload size (bytes) = 10 MB */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/** Accepted MIME types for image upload */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Cloudinary upload folder */
export const CLOUDINARY_FOLDER = 'image-lifecycle';

/** API base paths */
export const API_PATHS = {
  ANALYZE:  '/api/images/analyze',
  TREE:     '/api/images/tree',
  NODE:     '/api/images/node',
} as const;
