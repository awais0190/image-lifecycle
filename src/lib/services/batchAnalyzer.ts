/**
 * Batch image analyzer.
 * Downloads and fingerprints discovered images in parallel (max 5 concurrent).
 * Failures are logged and skipped — never crash the pipeline.
 */

import { downloadImageFromUrl, validateImageBuffer } from '@/lib/utils/imageIngestion';
import { generateFingerprints }                      from '@/lib/utils/fingerprint';
import { extractExifData }                           from '@/lib/utils/exifExtractor';
import { hammingDistance }                           from '@/lib/utils/duplicateDetector';
import type { WebSearchResult, ImageMetadata }       from '@/types/image';
import type { EditingDetection }                     from '@/lib/utils/exifExtractor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalyzedImage {
  url: string;
  pHash: string;
  cryptoHash: string;
  metadata: ImageMetadata;
  editingDetection: EditingDetection;
  matchType: 'full' | 'partial' | 'similar';
  pHashDistance: number;          // Hamming distance from root pHash
  googleScore: number;
  platform: string;
  downloadedAt: Date;
  downloadSuccess: boolean;
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch   = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((item, j) => fn(item, i + j)));
    results.push(...settled);
  }
  return results;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Download, validate, fingerprint, and extract EXIF for each discovered URL.
 * Processes max 5 at a time. Returns only results that could be analyzed.
 */
export async function analyzeDiscoveredImages(
  results: WebSearchResult[],
  rootPHash: string
): Promise<AnalyzedImage[]> {
  console.log(`[BatchAnalyzer] Analyzing ${results.length} discovered images (max 5 concurrent)...`);

  const settled = await processInBatches(results, 5, async (result, i) => {
    const label = `(${i + 1}/${results.length})`;
    console.log(`[BatchAnalyzer] Processing ${label}: ${result.url.slice(0, 70)}`);

    // Download
    let buffer: Buffer;
    try {
      buffer = await downloadImageFromUrl(result.url);
    } catch (err) {
      console.warn(`[BatchAnalyzer] ⚠ Download failed ${label}: ${(err as Error).message}`);
      throw err;
    }

    // Validate
    const validation = await validateImageBuffer(buffer);
    if (!validation.valid) {
      console.warn(`[BatchAnalyzer] ⚠ Validation failed ${label}: ${validation.error}`);
      throw new Error(validation.error);
    }

    // Fingerprint + EXIF (parallel)
    const [fps, exif] = await Promise.all([
      generateFingerprints(buffer),
      extractExifData(buffer),
    ]);

    // Drop buffer explicitly (let GC reclaim it)
    (buffer as unknown as null);

    const pHashDist = hammingDistance(fps.pHash, rootPHash);

    const analyzed: AnalyzedImage = {
      url:              result.url,
      pHash:            fps.pHash,
      cryptoHash:       fps.cryptoHash,
      metadata: {
        width:       exif.width,
        height:      exif.height,
        format:      exif.format,
        fileSize:    exif.fileSize,
        dateCreated: exif.dateCreated,
        camera:      exif.camera,
        software:    exif.software,
        gps:         exif.gps,
      },
      editingDetection: exif.editingDetection,
      matchType:        result.matchType,
      pHashDistance:    pHashDist,
      googleScore:      result.score,
      platform:         result.platform ?? 'Unknown',
      downloadedAt:     new Date(),
      downloadSuccess:  true,
    };

    console.log(
      `[BatchAnalyzer] ✓ Done ${label} — pHash dist: ${pHashDist}, platform: ${analyzed.platform}`
    );
    return analyzed;
  });

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<AnalyzedImage> => r.status === 'fulfilled')
    .map((r) => r.value);

  console.log(
    `[BatchAnalyzer] Completed: ${successful.length}/${results.length} successful`
  );
  return successful;
}
