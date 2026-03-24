# ImageTrace — Life Cycle of an Image

> A forensic-grade Next.js application that traces image provenance, detects edits via six independent signals, and renders an interactive family tree of how images spread and transform across the web.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# → Fill in keys (see table below)

# 3. Run development server
npm run dev
# → Open http://localhost:3000

# 4. Start the Python ML microservice (required for CLIP, ArcFace, partial-match)
cd ../image-lifecycle-ml
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret (server-only) |
| `GOOGLE_VISION_API_KEY` | ✅ | GCP API key with Vision Web Detection enabled |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL of the app (used for absolute URLs) |
| `CLIP_SERVICE_URL` | ✅ | URL of the Python FastAPI ML microservice |

---

## Folder Structure

```
src/
├── app/
│   ├── (landing)/
│   │   └── page.tsx              ← marketing landing page
│   ├── (dashboard)/
│   │   ├── layout.tsx            ← dashboard shell (Navbar + Sidebar)
│   │   ├── analyze/page.tsx      ← Image Analyzer (full 16-step pipeline)
│   │   ├── compare/page.tsx      ← Image Comparator (two-image analysis)
│   │   ├── batch/page.tsx        ← Batch Analyzer (2–10 images, MST)
│   │   └── about/page.tsx        ← Documentation & pipeline reference
│   ├── api/
│   │   ├── images/
│   │   │   ├── analyze/route.ts  ← POST: full 16-step provenance pipeline
│   │   │   ├── compare/route.ts  ← POST: pairwise two-image comparison
│   │   │   ├── batch/route.ts    ← POST: MST-based multi-image analysis
│   │   │   ├── tree/[hash]/route.ts ← GET: full provenance tree
│   │   │   └── node/[hash]/route.ts ← GET/PATCH: single image node
│   │   └── health/
│   │       └── clip/route.ts     ← GET: ML service health check
│   ├── layout.tsx                ← root layout (Inter font, metadata)
│   └── globals.css               ← Tailwind v4 + custom color tokens
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Sidebar.tsx
│   ├── upload/
│   │   ├── ImageUploader.tsx     ← drag-and-drop file upload
│   │   ├── UrlInput.tsx          ← URL submission form
│   │   └── UploadCard.tsx        ← tab switcher wrapping both
│   ├── tree/
│   │   ├── TreeCanvas.tsx        ← React Flow canvas
│   │   ├── TreeStats.tsx         ← tree summary statistics
│   │   ├── ImageNodeCard.tsx     ← image node with forensics overlay
│   │   └── NodeCard.tsx          ← custom React Flow node renderer
│   ├── forensics/
│   │   ├── ForensicsPanel.tsx    ← ELA results + confidence
│   │   ├── ELAViewer.tsx         ← heatmap viewer
│   │   ├── EditSignalsPanel.tsx  ← breakdown of all 6 edit signals
│   │   ├── EditTypeCards.tsx     ← edit type categorization cards
│   │   └── MetadataTable.tsx     ← EXIF data display
│   └── shared/
│       ├── LoadingSpinner.tsx
│       ├── StatusBadge.tsx       ← original / edited / uncertain / duplicate
│       ├── EmptyState.tsx
│       └── ErrorBoundary.tsx
│
├── lib/
│   ├── db/
│   │   ├── mongodb.ts            ← connection singleton w/ retry logic
│   │   └── models/ImageNode.ts  ← Mongoose schema + methods
│   ├── cloudinary/
│   │   ├── config.ts             ← SDK init from env vars
│   │   └── upload.ts             ← uploadImage(buffer, opts) helper
│   ├── services/
│   │   ├── googleVision.ts       ← Vision API Web Detection client
│   │   ├── clipService.ts        ← CLIP embed, zero-shot, partial-match client
│   │   ├── batchAnalyzer.ts      ← Prim's MST multi-image analysis
│   │   ├── editAnalysisService.ts← 6-signal weighted edit assessment
│   │   ├── relationshipEngine.ts ← parent/child edge scoring & graph build
│   │   └── faceService.ts        ← DeepFace ArcFace face verification client
│   ├── config/
│   │   └── env.ts                ← validated env variable access
│   └── utils/
│       ├── fingerprint.ts        ← SHA-256 + pHash + dHash computation
│       ├── elaAnalysis.ts        ← ELA heatmap generation via Sharp
│       ├── exifExtractor.ts      ← EXIF parsing (exifr) + software detection
│       ├── editDetector.ts       ← EXIF signal scoring
│       ├── visualEditAnalysis.ts ← visual heuristics (borders, text, noise)
│       ├── duplicateDetector.ts  ← exact + near-duplicate lookup
│       ├── imageIngestion.ts     ← URL fetch + buffer normalization
│       └── treeBuilder.ts        ← provenance graph → nested TreeJSON
│
└── types/
    └── image.ts                  ← all TypeScript interfaces
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + Radix UI |
| Animations | Framer Motion |
| Database | MongoDB Atlas via Mongoose |
| Storage | Cloudinary CDN |
| Tree Visualization | React Flow (XY Flow) + Dagre layout |
| Image Processing | Sharp (ELA heatmaps, resizing) |
| EXIF Parsing | exifr |
| AI Embeddings | OpenAI CLIP ViT-B/32 (512-dim) via Python sidecar |
| Zero-Shot Classification | CLIP vs 15 editing prompts + 3 original prompts |
| Face Verification | DeepFace ArcFace (cosine distance < 0.68 threshold) |
| Reverse Image Search | Google Vision Web Detection API |
| Fingerprinting | SHA-256 + pHash (DCT, 256-bit) + dHash (diff, 256-bit) |

---

## Tools

| Tool | Route | Description |
|---|---|---|
| Image Analyzer | `/analyze` | Full 16-step provenance pipeline |
| Image Comparator | `/compare` | Two-image pHash + dHash + CLIP + ArcFace + crop comparison |
| Batch Analyzer | `/batch` | Prim's MST over 2–10 images to find parent/child/sibling relationships |

---

## Analysis Pipeline — 16 Steps (Image Analyzer)

| # | Step | Key detail |
|---|---|---|
| 1 | Parse & validate | Accept file or URL. JPEG, PNG, WebP, GIF. Max 15 MB, min 50×50px. |
| 2 | Fingerprint (4 methods) | SHA-256, pHash (DCT 256-bit), dHash (diff 256-bit), CLIP 512-dim embedding |
| 3 | EXIF extraction | Camera make/model, software (Photoshop, GIMP, Lightroom, Canva…), GPS, timestamps |
| 4 | Exact duplicate check | SHA-256 lookup in MongoDB; return cached result immediately if found |
| 5 | Similarity search | pHash Hamming distance + CLIP cosine against 200 most recent nodes |
| 6 | Upload to Cloudinary | Deterministic `public_id` (SHA-256 prefix) prevents re-uploads |
| 7 | ELA heatmap | Recompress at 95% JPEG → pixel diff → amplify ×10 → warm-color heatmap |
| 8 | Visual heuristics | Text/watermark blocks, uniform borders, social-media crops, compression ratio, noise |
| 9 | 6-signal edit assessment | EXIF (0.22) + ELA (0.28) + visual (0.12) + structural (0.13) + CLIP semantic (0.22) + CLIP zero-shot (0.35) |
| 10 | Save root node | Upsert root ImageNode to MongoDB before Vision search |
| 11 | Google Vision search | Web Detection — full, partial, and similar matches across billions of pages |
| 12 | Batch download & analyze | 5 concurrent. Each copy: fingerprint, EXIF, ELA, visual, CLIP zero-shot, crop detection, ArcFace |
| 13 | Upsert discovered nodes | Exact-match check, full edit assessment, platform tagging |
| 14 | Build relationship graph | Weighted score: date (0.35) + pHash (0.20) + match type (0.12) + CLIP (0.18) + crop boost (+0.40) |
| 15 | Persist edges | Bulk MongoDB writes — parent.children, child.parentHash, depth for all nodes |
| 16 | Return TreeJSON | Nested tree, TreeStats (totals, platforms, depth), processingTime, discoveredCount |

**Edit verdict thresholds:** ≥ 0.70 → `edited` · ≥ 0.35 → `uncertain` · < 0.35 → `original`

---

## Python ML Microservice (`image-lifecycle-ml/`)

FastAPI service loaded with three models at startup:

| Endpoint | Model | Output |
|---|---|---|
| `POST /embed` | CLIP ViT-B/32 | 512-dim unit-normalized embedding |
| `POST /classify/editing` | CLIP zero-shot | Edit probability vs 15 prompts + 3 original prompts |
| `POST /face/verify` | DeepFace ArcFace | verified (bool), distance, face_detected |
| `POST /face/detect` | OpenCV Haar | face_detected, face_count, confidence |
| `POST /image/partial-match` | Multi-scale template matching | is_partial, confidence, which image contains the other |
| `POST /edit/analyze-single` | ColorChangeDetector | filter, hue shift, desaturation, brightness changes |
| `POST /edit/analyze-comparison` | ColorChangeDetector + ObjectDetector | full diff heatmap, regions added/removed/modified |
| `POST /edit/quick-check` | Color-only | Fast is_edited + edit_types (< 1s) |
| `GET /health` | — | clip_loaded, face_loaded status |

All CPU-bound inference runs in a thread pool executor (non-blocking async). CORS open for local dev and production. Graceful degradation — partial results returned on any failure.

---

## Edit Detection — 6 Signals

| Signal | Weight | How it works |
|---|---|---|
| CLIP Zero-Shot | **0.35** | CLIP classifies image against 15 editing prompts (watermark, filter, meme…) via softmax |
| ELA | 0.28 | Recompress at 95%, amplify pixel diff ×10. Score > 0.20 → 95% confidence edited |
| CLIP Semantic Drift | 0.22 | Cosine distance between root and copy embeddings. < 0.60 similarity → 0.90 edit score |
| EXIF | 0.22 | Editing software detection (Photoshop, GIMP, Lightroom, Canva, Snapseed…) |
| Structural | 0.13 | Fires when pHash ≥ 8 AND CLIP ≥ 0.75 (watermarks/overlays that pHash catches but CLIP scores similar) |
| Visual Heuristics | 0.12 | Text blocks, uniform borders, social-media crops, compression anomalies, noise quadrants |

---

## Design System

| Token | Value | Usage |
|---|---|---|
| background | `#0d1117` | Page background |
| surface | `#161b27` | Cards, panels |
| border | `#30363d` | All borders |
| border-subtle | `#21262d` | Dividers |
| green | `#3fb950` | Primary accent, original nodes |
| blue | `#58a6ff` | Secondary accent, similarity |
| gold | `#d29922` | Warnings, batch features |
| red | `#f85149` | Edited nodes, danger |
| text-primary | `#e6edf3` | Headings, labels |
| text-muted | `#8b949e` | Body text |
| text-subtle | `#484f58` | Captions, secondary |

Aesthetic: **dark forensic lab** — not generic SaaS.

---

## License

MIT
