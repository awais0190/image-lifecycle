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
import { faceService }                               from '@/lib/services/faceService';
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
  clipEmbedding:      number[] | null;
  dHash:              string;
  elaScore:           number;
  elaHeatmapUrl:      string;
  // Partial/crop match against the root image
  isPartialOfRoot:        boolean;
  partialMatchConfidence: number;
  partialMatchWhich:      'B_in_A' | 'A_in_B' | null; // B_in_A = discovered is crop of root
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
 * Download, validate, fingerprint, run ELA, extract EXIF, and check for crop
 * relationship against the root image for each discovered URL.
 * Processes max 5 at a time. Returns only results that could be analyzed.
 */
export async function analyzeDiscoveredImages(
  results:    WebSearchResult[],
  rootPHash:  string,
  rootBuffer: Buffer | null = null,   // pass to enable crop detection vs root
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

    // Fingerprint + EXIF + ELA + crop detection — all concurrent
    // (template matching via OpenCV has no concurrency issues unlike DeepFace)
    const [fps, exif, ela, partialMatch] = await Promise.all([
      generateFingerprints(buffer),
      extractExifData(buffer),
      performELA(buffer).catch(() => ({
        elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
        isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
      })),
      rootBuffer
        ? faceService.detectPartialMatch(rootBuffer, buffer).catch(() => null)
        : Promise.resolve(null),
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
      editingDetection:       exif.editingDetection,
      matchType:              result.matchType,
      pHashDistance:          pHashDist,
      googleScore:            result.score,
      platform:               result.platform ?? 'Unknown',
      downloadedAt:           new Date(),
      downloadSuccess:        true,
      clipEmbedding:          fps.clipEmbedding,
      dHash:                  fps.dHash,
      elaScore:               ela.elaScore,
      elaHeatmapUrl:          ela.elaHeatmapUrl,
      isPartialOfRoot:        partialMatch?.isPartial   ?? false,
      partialMatchConfidence: partialMatch?.confidence  ?? 0,
      partialMatchWhich:      partialMatch?.which       ?? null,
    };

    console.log(
      `[BatchAnalyzer] ✓ Done ${label} — pHashDist: ${pHashDist}, ELA: ${ela.elaScore.toFixed(4)}, CLIP: ${fps.clipEmbedding ? '512d' : 'null'}, crop: ${analyzed.isPartialOfRoot}, platform: ${analyzed.platform}`
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
