/**
 * Google Vision Web Detection service.
 * Uses the Vision REST API with an API key (no service-account JSON needed).
 * Finds full/partial/visually-similar copies of an image already on the web.
 */

import axios from 'axios';
import { config } from '@/lib/config/env';
import type { WebSearchResult } from '@/types/image';

// ─── REST API types (subset we use) ──────────────────────────────────────────

interface VisionImageRef  { url: string; score?: number }
interface VisionPageRef   { url: string; pageTitle?: string; fullMatchingImages?: VisionImageRef[] }

interface VisionWebDetection {
  webEntities?:             { entityId: string; score: number; description: string }[];
  fullMatchingImages?:      VisionImageRef[];
  partialMatchingImages?:   VisionImageRef[];
  visuallySimilarImages?:   VisionImageRef[];
  pagesWithMatchingImages?: VisionPageRef[];
}

interface VisionResponse {
  responses: Array<{
    webDetection?: VisionWebDetection;
    error?:        { code: number; message: string };
  }>;
}

const VISION_API = 'https://vision.googleapis.com/v1/images:annotate';
const MAX_RESULTS = 20; // ask for more, then trim after filtering

// ─── Platform detection ───────────────────────────────────────────────────────

const PLATFORM_MAP: [RegExp, string][] = [
  [/twitter\.com|x\.com/i,    'Twitter/X'],
  [/reddit\.com/i,            'Reddit'],
  [/facebook\.com/i,          'Facebook'],
  [/instagram\.com/i,         'Instagram'],
  [/imgur\.com/i,             'Imgur'],
  [/wikipedia\.org/i,         'Wikipedia'],
  [/tumblr\.com/i,            'Tumblr'],
  [/pinterest\.com/i,         'Pinterest'],
  [/tiktok\.com/i,            'TikTok'],
  [/youtube\.com/i,           'YouTube'],
  [/flickr\.com/i,            'Flickr'],
  [/unsplash\.com/i,          'Unsplash'],
];

/**
 * Detect the platform name from a URL hostname.
 */
export function detectPlatform(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [pattern, name] of PLATFORM_MAP) {
      if (pattern.test(hostname)) return name;
    }
    // Return clean domain (e.g. "example.com")
    return hostname.split('.').slice(-2).join('.');
  } catch {
    return 'Unknown';
  }
}

/**
 * Build a page-URL index from Vision's pagesWithMatchingImages so we can
 * annotate each image URL with the page it appeared on.
 */
function buildPageIndex(pages: VisionPageRef[] = []): Map<string, string> {
  const index = new Map<string, string>();
  for (const page of pages) {
    for (const img of page.fullMatchingImages ?? []) {
      index.set(img.url, page.url);
    }
  }
  return index;
}

/**
 * Call Google Vision Web Detection on an image URL.
 * Returns up to `config.app.maxDiscoveredImages` deduplicated results.
 * On API failure returns an empty array (graceful degradation).
 */
export async function reverseImageSearch(imageUrl: string): Promise<WebSearchResult[]> {
  const apiKey = config.googleVision.apiKey;
  if (!apiKey) {
    console.warn('[Vision] GOOGLE_VISION_API_KEY not set — skipping reverse search');
    return [];
  }

  console.log(`[Phase03] Running Google Vision reverse search on: ${imageUrl.slice(0, 60)}...`);

  let response: VisionResponse;
  try {
    const { data } = await axios.post<VisionResponse>(
      `${VISION_API}?key=${apiKey}`,
      {
        requests: [{
          image:    { source: { imageUri: imageUrl } },
          features: [{ type: 'WEB_DETECTION', maxResults: MAX_RESULTS }],
        }],
      },
      { timeout: 15_000 }
    );
    response = data;
  } catch (err) {
    console.error('[Vision] API request failed:', (err as Error).message);
    throw err; // re-throw so the route can set visionSearchFailed = true
  }

  const detection = response.responses[0]?.webDetection;
  if (!detection) {
    const apiErr = response.responses[0]?.error;
    if (apiErr) {
      console.error('[Vision] API error:', apiErr.code, apiErr.message);
      // Surface billing / quota errors with a clear message
      if (apiErr.code === 403) {
        throw new Error(`Google Vision billing not enabled (403). Enable billing at: https://console.developers.google.com/billing/enable`);
      }
      throw new Error(`Google Vision error ${apiErr.code}: ${apiErr.message}`);
    }
    return [];
  }

  const pageIndex = buildPageIndex(detection.pagesWithMatchingImages);
  const results: WebSearchResult[] = [];
  const seenUrls = new Set<string>([imageUrl]); // exclude the uploaded image itself

  const pushResults = (
    images: VisionImageRef[] = [],
    matchType: WebSearchResult['matchType']
  ) => {
    for (const img of images) {
      if (!img.url || seenUrls.has(img.url)) continue;
      seenUrls.add(img.url);
      results.push({
        url:       img.url,
        matchType,
        score:     img.score ?? 0.5,
        pageUrl:   pageIndex.get(img.url),
        platform:  detectPlatform(img.url),
      });
    }
  };

  pushResults(detection.fullMatchingImages,    'full');
  pushResults(detection.partialMatchingImages, 'partial');
  pushResults(detection.visuallySimilarImages, 'similar');

  // Sort by score descending, cap at maxDiscoveredImages
  const trimmed = results
    .sort((a, b) => b.score - a.score)
    .slice(0, config.app.maxDiscoveredImages);

  console.log(`[Phase03] Vision returned ${results.length} results → trimmed to ${trimmed.length}`);
  return trimmed;
}
