/**
 * Batch image analyzer.
 * Downloads, fingerprints, runs ELA, and extracts EXIF for each discovered URL.
 * Processes max 5 at a time. Failures are logged and skipped.
 */

import { downloadImageFromUrl, validateImageBuffer } from '@/lib/utils/imageIngestion';
import { generateFingerprints }                      from '@/lib/utils/fingerprint';
import { extractExifData }                           from '@/lib/utils/exifExtractor';
import { performELA }                                from '@/lib/utils/elaAnalysis';
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
  clipEmbedding:  number[] | null;
  dHash:          string;
  elaScore:       number;
  elaHeatmapUrl:  string;
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
 * Download, validate, fingerprint, run ELA, and extract EXIF for each discovered URL.
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

    // Fingerprint + EXIF + ELA in parallel
    const [fps, exif, ela] = await Promise.all([
      generateFingerprints(buffer),
      extractExifData(buffer),
      performELA(buffer).catch(() => ({
        elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
        isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
      })),
    ]);

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
      clipEmbedding:    fps.clipEmbedding,
      dHash:            fps.dHash,
      elaScore:         ela.elaScore,
      elaHeatmapUrl:    ela.elaHeatmapUrl,
    };

    console.log(
      `[BatchAnalyzer] ✓ Done ${label} — pHashDist: ${pHashDist}, ELA: ${ela.elaScore.toFixed(4)}, CLIP: ${fps.clipEmbedding ? '512d' : 'null'}, platform: ${analyzed.platform}`
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
