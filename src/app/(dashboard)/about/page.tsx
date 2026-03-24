'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ScanSearch, GitCompareArrows,
  Globe, Cpu, ScanLine, Database, Layers,
  ShieldCheck, ArrowRight, TreePine, Binary,
  Zap, Hash, Info,
} from 'lucide-react';

// ─── Animation ─────────────────────────────────────────────────────────────────

const fadeUp = (delay = 0) => ({
  initial:   { opacity: 0, y: 16 },
  animate:   { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: '#3fb950' }}>
        {label}
      </p>
      <h2 className="text-xl font-bold sm:text-2xl" style={{ color: '#e6edf3' }}>{title}</h2>
      {sub && <p className="mt-2 text-sm leading-relaxed" style={{ color: '#8b949e' }}>{sub}</p>}
    </div>
  );
}

// ─── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      {children}
    </div>
  );
}

// ─── Tech table row ────────────────────────────────────────────────────────────

function TechRow({
  icon: Icon, color, label, value,
}: { icon: React.ElementType; color: string; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: '1px solid #21262d' }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}15`, border: `1px solid ${color}25` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex flex-1 items-center justify-between gap-4">
        <span className="text-xs font-medium" style={{ color: '#e6edf3' }}>{label}</span>
        <span className="text-right text-xs" style={{ color: '#484f58' }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Pipeline step ─────────────────────────────────────────────────────────────

function PipelineStep({
  n, title, detail, color = '#3fb950',
}: { n: string; title: string; detail: string; color?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
      >
        {n}
      </div>
      <div>
        <p className="text-xs font-semibold" style={{ color: '#e6edf3' }}>{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: '#484f58' }}>{detail}</p>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: '/analyze', icon: ScanSearch, color: '#3fb950',
    label: 'Image Analyzer',
    desc:  'Full 16-step provenance pipeline — fingerprinting, 6-signal edit detection, Vision search, tree construction.',
  },
  {
    href: '/compare', icon: GitCompareArrows, color: '#58a6ff',
    label: 'Comparator',
    desc:  'Side-by-side analysis with pHash, dHash, CLIP, DeepFace ArcFace, and multi-scale crop detection.',
  },
  {
    href: '/batch', icon: Layers, color: '#d29922',
    label: 'Batch Analyzer',
    desc:  "Analyze 2–10 images to find parent/child/sibling relationships using Prim's MST algorithm.",
  },
];

const TECH = [
  { icon: Cpu,       color: '#58a6ff', label: 'CLIP ViT-B/32',            value: '512-dim embedding + zero-shot editing classification' },
  { icon: ShieldCheck,color:'#3fb950', label: 'DeepFace ArcFace',         value: 'Face verification across discovered copies' },
  { icon: ScanLine,  color: '#3fb950', label: 'pHash + dHash',            value: '256-bit perceptual + difference fingerprints' },
  { icon: ScanLine,  color: '#d29922', label: 'Error Level Analysis',     value: 'JPEG recompression delta heatmap (×10 amplified)' },
  { icon: Globe,     color: '#f85149', label: 'Google Vision API',        value: 'Web Detection — full, partial, similar matches' },
  { icon: Hash,      color: '#8b949e', label: 'SHA-256',                  value: 'Cryptographic byte-exact identity' },
  { icon: Database,  color: '#3fb950', label: 'MongoDB Atlas',            value: 'Persistent provenance graph store' },
  { icon: Zap,       color: '#58a6ff', label: 'Cloudinary CDN',           value: 'Image hosting + ELA heatmap storage' },
  { icon: TreePine,  color: '#d29922', label: 'React Flow',               value: 'Interactive directed provenance graph' },
  { icon: Layers,    color: '#3fb950', label: 'Next.js App Router',       value: 'Full-stack React + API routes' },
  { icon: Binary,    color: '#8b949e', label: 'Python FastAPI ML Service',value: 'CLIP, ArcFace, partial-match, color & object diff' },
];

const ANALYZE_STEPS = [
  { n: '1',  color: '#3fb950', title: 'Parse & validate',             detail: 'Accept file upload or URL. Validate MIME type, size (max 15 MB), min dimensions (50×50), image integrity.' },
  { n: '2',  color: '#3fb950', title: 'Fingerprint (4 methods)',       detail: 'Compute SHA-256, 256-bit pHash (DCT average), 256-bit dHash (difference), and 512-dim CLIP ViT-B/32 embedding in parallel.' },
  { n: '3',  color: '#3fb950', title: 'EXIF extraction',               detail: 'Parse EXIF with exifr — camera make/model, software (Photoshop, GIMP, Lightroom, Canva…), GPS, timestamps.' },
  { n: '4',  color: '#3fb950', title: 'Exact duplicate check',         detail: 'Query MongoDB by SHA-256. Return cached result immediately if found (seenCount incremented).' },
  { n: '5',  color: '#58a6ff', title: 'Similarity search',             detail: 'pHash Hamming distance + CLIP cosine similarity against 200 most recent nodes. Returns nearest match.' },
  { n: '6',  color: '#58a6ff', title: 'Upload to Cloudinary',          detail: 'Deterministic public_id (SHA-256 prefix) prevents redundant re-uploads.' },
  { n: '7',  color: '#d29922', title: 'ELA heatmap',                   detail: 'Recompress at 95% → diff pixel-by-pixel → amplify ×10 → warm-color heatmap. elaScore = totalDiff / (pixels × 255).' },
  { n: '8',  color: '#d29922', title: 'Visual heuristics',             detail: 'Detect text/watermark blocks, uniform borders, social-media crop formats, compression ratio anomalies, noise inconsistency across quadrants.' },
  { n: '9',  color: '#d29922', title: '6-signal edit assessment',      detail: 'Weighted vote: EXIF (0.22), ELA (0.28), visual (0.12), structural pHash+CLIP (0.13), CLIP semantic (0.22), CLIP zero-shot classification (0.35).' },
  { n: '10', color: '#f85149', title: 'Save root node',                detail: 'Upsert root ImageNode into MongoDB with all fingerprints, forensics, and metadata before Vision search.' },
  { n: '11', color: '#f85149', title: 'Google Vision reverse search',  detail: 'Web Detection across billions of pages. Returns full, partial, and similar matches with platform detection.' },
  { n: '12', color: '#f85149', title: 'Batch download & analyze',      detail: '5 concurrent downloads. Each copy: fingerprint, EXIF, ELA, visual heuristics, CLIP embedding, CLIP zero-shot, multi-scale crop detection, DeepFace ArcFace face verification.' },
  { n: '13', color: '#8b949e', title: 'Upsert discovered nodes',       detail: 'For each copy: exact-match check, full edit assessment, add source platform. New nodes created, existing nodes updated.' },
  { n: '14', color: '#8b949e', title: 'Build relationship graph',      detail: 'Weighted scoring: date heuristic (0.35) + pHash distance (0.20) + Vision match type (0.12) + CLIP (0.18) + crop boost (+0.40). Max depth 5.' },
  { n: '15', color: '#8b949e', title: 'Persist edges',                 detail: 'Bulk MongoDB writes — update parent\'s children array, child\'s parentHash, and depth for all affected nodes.' },
  { n: '16', color: '#8b949e', title: 'Return TreeJSON',               detail: 'Nested tree (children sorted by status), TreeStats (totals, platforms, depth), processingTime, discoveredCount. clipEmbedding stripped from response.' },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-10 p-5 lg:p-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0)} className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
          >
            <Info size={18} style={{ color: '#3fb950' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#e6edf3' }}>About ImageTrace</h1>
            <p className="text-xs" style={{ color: '#8b949e' }}>
              How the system works, what powers it, and how to use it
            </p>
          </div>
        </motion.div>

        {/* ── Overview ────────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.05)}>
          <Card>
            <div className="flex items-start gap-4">
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
              >
                <ScanSearch size={20} style={{ color: '#3fb950' }} />
              </div>
              <div>
                <h2 className="mb-2 text-base font-bold" style={{ color: '#e6edf3' }}>
                  What is ImageTrace?
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: '#8b949e' }}>
                  ImageTrace is an image forensics and provenance platform. Given any image, it
                  discovers every copy that exists on the internet, detects how each copy was
                  edited, determines who the original likely is, and visualizes the entire
                  spread as an interactive directed graph — the image&apos;s &ldquo;lifecycle.&rdquo;
                </p>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: '#8b949e' }}>
                  It combines four fingerprinting methods (SHA-256, pHash, dHash, CLIP), six
                  edit-detection signals including CLIP zero-shot classification and DeepFace
                  ArcFace face verification, ELA heatmaps, EXIF forensics, and Google Vision
                  reverse-image search — all orchestrated in a single 16-step pipeline.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ── Tools ───────────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.08)}>
          <SectionHeader
            label="Tools"
            title="Three tools, one mission"
            sub="Each tool is purpose-built for a specific forensic workflow."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TOOLS.map(({ href, icon: Icon, color, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-2xl p-4 transition-all duration-150 hover:brightness-110"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                >
                  <Icon size={17} style={{ color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#e6edf3' }}>{label}</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: '#484f58' }}>{desc}</p>
                </div>
                <div
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color }}
                >
                  Open <ArrowRight size={11} />
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* ── Analysis pipeline ───────────────────────────────────────── */}
        <motion.div {...fadeUp(0.1)}>
          <SectionHeader
            label="Pipeline"
            title="Image Analyzer — 16-step pipeline"
            sub="Every image submitted to the Analyzer runs through this exact sequence."
          />
          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ANALYZE_STEPS.map((s) => (
                <PipelineStep key={s.n} {...s} />
              ))}
            </div>
          </Card>
        </motion.div>

        {/* ── Forensics explanation ────────────────────────────────────── */}
        <motion.div {...fadeUp(0.12)}>
          <SectionHeader
            label="Forensics"
            title="How edit detection works — 6 signals"
            sub="Six independent signals are weighted and voted on to produce a single edit probability score."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: ScanLine,  color: '#d29922',
                title: 'ELA — Error Level Analysis (0.28)',
                body:  'Re-saved at 95% JPEG quality. Pixel differences amplified ×10 into a warm-color heatmap. elaScore > 0.20 yields 95% edit confidence. Uploaded to Cloudinary under ela-heatmaps/.',
              },
              {
                icon: Binary, color: '#8b949e',
                title: 'EXIF Signal (0.22)',
                body:  'Detects editing software tags: Photoshop, GIMP, Lightroom, Pixelmator, Affinity Photo, Canva, PicsArt, Snapseed. Missing camera fields and timestamp mismatches are also scored.',
              },
              {
                icon: Cpu, color: '#58a6ff',
                title: 'CLIP Zero-Shot (0.35 — highest)',
                body:  'CLIP ViT-B/32 classifies the image against 15 editing prompts (watermark, filter, meme, photoshopped, thumbnail, screenshot…) vs 3 original prompts. Softmax produces a calibrated edit probability.',
              },
              {
                icon: Cpu, color: '#3fb950',
                title: 'CLIP Semantic Drift (0.22)',
                body:  'Cosine distance between root and copy 512-dim embeddings. Similarity < 0.60 (high semantic drift) scores 0.90 edit probability — suggests cropping, recoloring, or object insertion.',
              },
              {
                icon: Zap, color: '#f85149',
                title: 'Visual Heuristics (0.12)',
                body:  'Scores five pixel-level patterns: text/watermark blocks (8×8 grid), uniform border strips, known social-media crop sizes, compression ratio anomalies, and noise inconsistency across quadrants.',
              },
              {
                icon: ScanLine, color: '#8b949e',
                title: 'Structural Signal (0.13)',
                body:  'Fires when pHash distance ≥ 8 AND CLIP ≥ 0.75 simultaneously — a pattern typical of watermark additions, color grading, and caption overlays that pHash catches but CLIP scores as similar.',
              },
            ].map(({ icon: Icon, color, title, body }) => (
              <Card key={title}>
                <div
                  className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                >
                  <Icon size={15} style={{ color }} />
                </div>
                <p className="mb-2 text-sm font-semibold" style={{ color: '#e6edf3' }}>{title}</p>
                <p className="text-xs leading-relaxed" style={{ color: '#484f58' }}>{body}</p>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* ── Similarity verdicts ──────────────────────────────────────── */}
        <motion.div {...fadeUp(0.13)}>
          <SectionHeader label="Thresholds" title="Similarity verdict thresholds" />
          <Card>
            <div className="space-y-0">
              {[
                { verdict: 'Identical',   color: '#3fb950', rule: 'SHA-256 match or pHash distance = 0',       note: 'Byte-for-byte or visually indistinguishable' },
                { verdict: 'Similar',     color: '#3fb950', rule: 'pHash distance ≤ 10 or CLIP ≥ 80%',        note: 'Same source, minor compression or resize' },
                { verdict: 'Related',     color: '#d29922', rule: 'pHash distance ≤ 20 or CLIP ≥ 60%',        note: 'Cropped, recolored, or lightly edited' },
                { verdict: 'Different',   color: '#f85149', rule: 'pHash distance > 20 and CLIP < 60%',       note: 'No meaningful visual relationship' },
              ].map(({ verdict, color, rule, note }) => (
                <div
                  key={verdict}
                  className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:gap-4"
                  style={{ borderBottom: '1px solid #21262d' }}
                >
                  <div
                    className="w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    {verdict}
                  </div>
                  <span className="flex-1 font-mono text-xs" style={{ color: '#484f58' }}>{rule}</span>
                  <span className="text-xs" style={{ color: '#30363d' }}>{note}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* ── Tech stack ──────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.15)}>
          <SectionHeader label="Stack" title="Technology stack" />
          <Card>
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {TECH.map((t) => <TechRow key={t.label} {...t} />)}
            </div>
          </Card>
        </motion.div>

        {/* ── Limitations ─────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.17)}>
          <SectionHeader label="Limitations" title="Known limitations & caveats" />
          <Card>
            <ul className="space-y-3">
              {[
                { icon: Globe,      color: '#f85149', text: 'Google Vision requires billing to be enabled on the GCP project. Without it, Vision returns no results and the provenance tree will always have a single node.' },
                { icon: ScanLine,   color: '#d29922', text: 'ELA is most reliable on JPEG images. PNG and WebP use lossless compression, so ELA scores may be inflated even for genuinely unedited images.' },
                { icon: Cpu,        color: '#58a6ff', text: 'CLIP embeddings, zero-shot classification, ArcFace face verification, and partial-match detection all require the Python FastAPI ML service to be running. The system degrades gracefully to pHash-only when offline.' },
                { icon: ShieldCheck,color: '#8b949e', text: 'Edit detection is a 6-signal weighted probability estimate, not a definitive verdict. A high score indicates likelihood of editing, not proof — treat results as investigative leads.' },
                { icon: Database,   color: '#3fb950', text: 'The near-duplicate scanner searches only the 200 most recent nodes for performance. Very large databases may miss older matches.' },
              ].map(({ icon: Icon, color, text }) => (
                <li key={text} className="flex items-start gap-3 text-xs" style={{ color: '#8b949e' }}>
                  <Icon size={13} className="mt-0.5 shrink-0" style={{ color }} />
                  {text}
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>

        {/* ── Footer CTA ──────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.18)}>
          <div
            className="flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center"
            style={{ background: '#161b27', border: '1px solid #30363d' }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
            >
              <ScanSearch size={22} style={{ color: '#3fb950' }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: '#e6edf3' }}>Ready to trace an image?</p>
              <p className="mt-1 text-sm" style={{ color: '#484f58' }}>
                Upload any image and get a full forensic report in seconds.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/analyze"
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-150 hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #1E8449, #27ae60)', color: '#fff', border: '1px solid rgba(30,132,73,0.5)' }}
              >
                <ScanSearch size={14} /> Open Analyzer
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-white/5"
                style={{ color: '#8b949e', border: '1px solid #30363d' }}
              >
                <GitCompareArrows size={14} /> Compare Images
              </Link>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
