# ImageTrace — Life Cycle of an Image

> A forensic-grade Next.js application that traces image provenance, detects edits via ELA analysis, and renders an interactive family tree of how images spread and transform across the web.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# → Fill in MongoDB URI, Cloudinary keys (see table below)

# 3. Run development server
npm run dev
# → Open http://localhost:3000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret (server-only) |
| `CLIP_SERVICE_URL` | Phase 02 | URL of the CLIP embedding microservice |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL of the app (used for absolute URLs) |

---

## Folder Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx        ← dashboard shell + Navbar
│   │   └── page.tsx          ← main upload + tree view
│   ├── api/
│   │   └── images/
│   │       ├── analyze/route.ts     ← POST: submit image for analysis
│   │       ├── tree/[hash]/route.ts ← GET: full provenance tree
│   │       └── node/[hash]/route.ts ← GET/PATCH: single node
│   ├── layout.tsx            ← root layout (Inter font, metadata)
│   └── globals.css           ← Tailwind v4 + custom color tokens
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Sidebar.tsx
│   ├── upload/
│   │   ├── ImageUploader.tsx  ← drag-and-drop file upload
│   │   ├── UrlInput.tsx       ← URL submission form
│   │   └── UploadCard.tsx     ← tab switcher wrapping both
│   ├── tree/
│   │   ├── TreeCanvas.tsx     ← React Flow canvas (Phase 03)
│   │   └── NodeCard.tsx       ← custom React Flow node (Phase 03)
│   ├── forensics/
│   │   ├── ForensicsPanel.tsx ← ELA results + confidence (Phase 02)
│   │   └── MetadataTable.tsx  ← EXIF data display (Phase 02)
│   └── shared/
│       ├── LoadingSpinner.tsx
│       ├── StatusBadge.tsx    ← original / edited / uncertain / duplicate
│       └── EmptyState.tsx
│
├── lib/
│   ├── db/
│   │   ├── mongodb.ts         ← connection singleton w/ retry logic
│   │   └── models/
│   │       └── ImageNode.ts   ← Mongoose schema + static/instance methods
│   ├── cloudinary/
│   │   ├── config.ts          ← SDK init from env vars
│   │   └── upload.ts          ← uploadImage(buffer, opts) helper
│   └── utils/
│       ├── cn.ts              ← clsx + tailwind-merge
│       └── constants.ts       ← SIMILARITY_THRESHOLDS, STATUS_COLORS, etc.
│
└── types/
    └── image.ts               ← all TypeScript interfaces
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | MongoDB Atlas via Mongoose |
| Storage | Cloudinary |
| Animations | Framer Motion |
| Tree Viz | React Flow *(Phase 03)* |
| AI Embeddings | CLIP microservice *(Phase 02)* |

---

## Phase Roadmap

### ✅ Phase 01 — Foundation (current)
- Project setup, design system, dark forensic UI
- All TypeScript interfaces
- MongoDB schema + Mongoose model
- Cloudinary upload helper
- Component architecture (upload, tree stubs, forensics stubs)
- API route stubs with TODO comments

### 🔜 Phase 02 — Analysis Pipeline
- SHA-256 + pHash computation
- ELA (Error Level Analysis) heatmap generation
- EXIF extraction
- CLIP microservice integration
- POST `/api/images/analyze` full implementation

### 🔜 Phase 03 — Interactive Tree
- React Flow canvas with custom nodes
- Dagre layout algorithm
- Tree traversal from MongoDB
- Click-to-inspect node → ForensicsPanel

### 🔜 Phase 04 — Web Discovery
- Google Vision API reverse image search
- Reverse search results as child nodes
- Platform detection (Twitter, Reddit, News)
- Admin correction workflow

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `navy-dark` | `#1a1a2e` | Page background |
| `navy-surface` | `#16213e` | Cards, panels |
| `emerald` | `#1E8449` | Primary accent, CTA |
| `emerald-light` | `#27ae60` | Hover states |
| `text-muted` | `#8892a4` | Secondary text |
| `border` | `#2d3748` | All borders |
| `danger` | `#e74c3c` | Edited nodes |
| `warning` | `#f39c12` | Uncertain nodes |

Aesthetic: **dark forensic lab** — not generic SaaS.

---

## License

MIT
