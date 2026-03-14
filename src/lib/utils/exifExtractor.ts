/**
 * EXIF metadata extraction utilities.
 * Uses exifr for EXIF parsing and sharp as a fallback for dimensions/format.
 * Missing EXIF is normal (web images often have metadata stripped) — returns
 * null/undefined fields gracefully without throwing.
 */

import exifr from 'exifr';
import sharp from 'sharp';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditingDetection {
  wasEdited: boolean;
  software: string | null;
  confidence: number;
}

export interface ExtractedMetadata {
  width: number;
  height: number;
  format: string;
  fileSize: number;
  dateCreated?: string;
  camera?: string;
  software?: string;
  gps?: { lat: number; lng: number };
  editingDetection: EditingDetection;
}

// ─── Known editing software list ─────────────────────────────────────────────

const EDITING_SOFTWARE_LIST = [
  'Adobe Photoshop',
  'GIMP',
  'Lightroom',
  'Pixelmator',
  'Affinity Photo',
  'Canva',
  'PicsArt',
  'Snapseed',
] as const;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Detect if an image was edited based on the Software EXIF tag.
 *
 * Confidence levels:
 *   0.9 — editing software matched
 *   0.7 — camera EXIF present, no editing software found
 *   0.3 — no EXIF at all (unknown provenance)
 */
export function detectEditingSoftware(software: string | undefined): EditingDetection {
  if (!software) {
    return { wasEdited: false, software: null, confidence: 0.3 };
  }

  const match = EDITING_SOFTWARE_LIST.find((s) =>
    software.toLowerCase().includes(s.toLowerCase())
  );

  if (match) {
    return { wasEdited: true, software: match, confidence: 0.9 };
  }

  // Software tag exists but doesn't match known editors — likely camera firmware
  return { wasEdited: false, software: null, confidence: 0.7 };
}

/**
 * Extract EXIF metadata from a raw image Buffer.
 * Falls back to sharp for dimensions/format when EXIF is absent.
 * Never throws — returns empty/null fields if EXIF is missing.
 */
export async function extractExifData(buffer: Buffer): Promise<ExtractedMetadata> {
  console.log('[Phase02] Extracting EXIF data...');

  // sharp always gives us format + dimensions reliably
  const sharpMeta = await sharp(buffer).metadata();
  const sharpWidth  = sharpMeta.width  ?? 0;
  const sharpHeight = sharpMeta.height ?? 0;
  const format      = sharpMeta.format ?? 'unknown';
  const fileSize    = buffer.byteLength;

  // Attempt full EXIF parse — many images have none, that's perfectly fine
  let exif: Record<string, unknown> | null = null;
  try {
    exif = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps:  true,
      icc:  false,
      iptc: false,
      xmp:  false,
    })) as Record<string, unknown> | null;
  } catch {
    console.log('[Phase02] No EXIF data found (normal for web images)');
  }

  if (!exif) {
    return {
      width: sharpWidth,
      height: sharpHeight,
      format,
      fileSize,
      editingDetection: detectEditingSoftware(undefined),
    };
  }

  // ── Camera string ──────────────────────────────────────────────────────────
  const make  = exif.Make  as string | undefined;
  const model = exif.Model as string | undefined;
  let camera: string | undefined;
  if (make && model) {
    // Avoid doubling the brand e.g. "Apple Apple iPhone 15"
    camera = model.toLowerCase().startsWith(make.toLowerCase())
      ? model.trim()
      : `${make} ${model}`.trim();
  } else {
    camera = model ?? make;
  }

  // ── Date created ──────────────────────────────────────────────────────────
  const rawDate = (exif.DateTimeOriginal ?? exif.DateTime) as Date | string | undefined;
  let dateCreated: string | undefined;
  if (rawDate instanceof Date) {
    dateCreated = rawDate.toISOString();
  } else if (typeof rawDate === 'string' && rawDate.trim()) {
    dateCreated = rawDate.trim();
  }

  // ── Software ──────────────────────────────────────────────────────────────
  const software = exif.Software as string | undefined;

  // ── GPS ───────────────────────────────────────────────────────────────────
  // exifr normalises GPS to top-level `latitude` / `longitude` properties
  const gpsLat = exif.latitude  ?? exif.GPSLatitude;
  const gpsLng = exif.longitude ?? exif.GPSLongitude;
  let gps: { lat: number; lng: number } | undefined;
  if (typeof gpsLat === 'number' && typeof gpsLng === 'number') {
    gps = { lat: gpsLat, lng: gpsLng };
  }

  // ── Width / Height ────────────────────────────────────────────────────────
  const width = (
    (exif.ExifImageWidth  as number | undefined) ??
    (exif.ImageWidth      as number | undefined) ??
    sharpWidth
  );
  const height = (
    (exif.ExifImageHeight as number | undefined) ??
    (exif.ImageHeight     as number | undefined) ??
    sharpHeight
  );

  // ── Editing detection ─────────────────────────────────────────────────────
  const editingDetection = detectEditingSoftware(software);

  // If a camera was identified but no editing software → bump confidence
  const finalDetection: EditingDetection =
    camera && !editingDetection.wasEdited
      ? { ...editingDetection, confidence: 0.7 }
      : editingDetection;

  console.log(
    `[Phase02] EXIF — camera: ${camera ?? 'none'}, software: ${software ?? 'none'}, gps: ${gps ? 'yes' : 'no'}`
  );

  return {
    width,
    height,
    format,
    fileSize,
    dateCreated,
    camera,
    software,
    gps,
    editingDetection: finalDetection,
  };
}
