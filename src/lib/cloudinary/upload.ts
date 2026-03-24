// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary — upload helper
//
// Upload helper — returns URL + dimensions. Supports ELA heatmap uploads.
// ─────────────────────────────────────────────────────────────────────────────

import '@/lib/cloudinary/config'; // ensure SDK is configured
import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY_FOLDER } from '@/lib/utils/constants';

export interface UploadResult {
  url:        string;
  publicId:   string;
  width:      number;
  height:     number;
  format:     string;
  bytes:      number;
}

export interface UploadOptions {
  /**
   * SHA-256 hex of the raw file bytes.
   * Used to build a deterministic public_id so the same image is never
   * uploaded twice (Cloudinary deduplication at folder level).
   * Optional — if omitted a random ID is generated.
   */
  sha256Hash?: string;
  /** Optional subfolder inside CLOUDINARY_FOLDER, e.g. "ela-heatmaps" */
  subfolder?: string;
  /** Cloudinary transformation tags */
  tags?: string[];
}

/**
 * Upload a raw image buffer to Cloudinary.
 *
 * @param buffer  Raw file bytes (Buffer or Uint8Array)
 * @param options Upload configuration
 * @returns       Upload metadata including the public CDN URL
 */
export async function uploadImage(
  buffer: Buffer | Uint8Array,
  options: UploadOptions
): Promise<UploadResult> {
  const { sha256Hash, subfolder, tags = [] } = options;

  // Deterministic public_id prevents re-uploading identical files (fallback to timestamp+random)
  const id        = sha256Hash ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const folder    = subfolder
    ? `${CLOUDINARY_FOLDER}/${subfolder}`
    : CLOUDINARY_FOLDER;
  const publicId  = `${folder}/${id}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id:        publicId,
        overwrite:        false,        // don't overwrite existing uploads
        resource_type:    'image',
        use_filename:     false,
        unique_filename:  false,
        tags:             ['image-lifecycle', ...tags],
        context:          sha256Hash ? { sha256: sha256Hash } : undefined,
      },
      (error, result) => {
        if (error || !result) {
          reject(
            error ?? new Error('Cloudinary upload returned no result')
          );
          return;
        }

        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          width:    result.width,
          height:   result.height,
          format:   result.format,
          bytes:    result.bytes,
        });
      }
    );

    // Pipe the buffer into the upload stream
    uploadStream.end(Buffer.from(buffer));
  });
}

/**
 * Delete an image from Cloudinary by public ID.
 * Used during cleanup / admin operations.
 *
 * TODO: wire up to admin API route.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}
