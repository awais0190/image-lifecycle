/**
 * Image ingestion utilities.
 * Handles downloading images from URLs and validating image buffers.
 * Buffers are never written to disk — everything stays in memory.
 */

import axios from 'axios';
import sharp from 'sharp';

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15 MB download limit
const MAX_VALID_BYTES    = 10 * 1024 * 1024; // 10 MB validation limit
const MIN_DIMENSION      = 50;

const ACCEPTED_FORMATS       = ['jpeg', 'png', 'webp', 'gif'] as const;
const ACCEPTED_CONTENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

// ─── Typed error classes ───────────────────────────────────────────────────────

export class InvalidUrlError extends Error {
  readonly code = 'INVALID_URL';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

export class FileTooLargeError extends Error {
  readonly code = 'FILE_TOO_LARGE';
  constructor(message: string) {
    super(message);
    this.name = 'FileTooLargeError';
  }
}

export class NotAnImageError extends Error {
  readonly code = 'NOT_AN_IMAGE';
  constructor(message: string) {
    super(message);
    this.name = 'NotAnImageError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageValidationResult {
  valid: boolean;
  format: string;
  width: number;
  height: number;
  fileSize: number;
  error?: string;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Download an image from a URL and return the raw Buffer.
 * Validates URL format, enforces timeout, checks Content-Type, and enforces max size.
 */
export async function downloadImageFromUrl(url: string): Promise<Buffer> {
  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new InvalidUrlError(`Invalid URL format: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new InvalidUrlError('URL must use http or https protocol');
  }

  console.log(`[Phase02] Downloading image from: ${url}`);

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 10_000,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    headers: {
      'User-Agent': 'ImageLifecycle/1.0',
      Accept: 'image/*',
    },
  });

  const contentType = (response.headers['content-type'] as string) ?? '';
  if (!ACCEPTED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    throw new NotAnImageError(
      `Response is not an image (Content-Type: ${contentType || 'unknown'})`
    );
  }

  const buffer = Buffer.from(response.data);

  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new FileTooLargeError(
      `Image too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB (max 15 MB)`
    );
  }

  console.log(`[Phase02] Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB`);
  return buffer;
}

/**
 * Validate an image Buffer using sharp.
 * Checks format, minimum dimensions, and file size limits.
 */
export async function validateImageBuffer(buffer: Buffer): Promise<ImageValidationResult> {
  const fileSize = buffer.byteLength;

  if (fileSize > MAX_VALID_BYTES) {
    return {
      valid: false,
      format: '',
      width: 0,
      height: 0,
      fileSize,
      error: `File too large: ${(fileSize / 1024 / 1024).toFixed(1)} MB (max 10 MB)`,
    };
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return {
      valid: false,
      format: '',
      width: 0,
      height: 0,
      fileSize,
      error: 'Could not read image data — file may be corrupt',
    };
  }

  const format = metadata.format ?? '';
  const width  = metadata.width  ?? 0;
  const height = metadata.height ?? 0;

  if (!ACCEPTED_FORMATS.includes(format as (typeof ACCEPTED_FORMATS)[number])) {
    return {
      valid: false,
      format,
      width,
      height,
      fileSize,
      error: `Unsupported format: "${format}". Accepted: jpeg, png, webp, gif`,
    };
  }

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return {
      valid: false,
      format,
      width,
      height,
      fileSize,
      error: `Image too small: ${width}×${height}px (minimum ${MIN_DIMENSION}×${MIN_DIMENSION})`,
    };
  }

  return { valid: true, format, width, height, fileSize };
}
