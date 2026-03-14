'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ScanSearch, GitCompareArrows, Microscope,
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
    desc:  'Full provenance pipeline — Vision search, tree construction, edit detection.',
  },
  {
    href: '/compare', icon: GitCompareArrows, color: '#58a6ff',
    label: 'Comparator',
    desc:  'Side-by-side similarity analysis with pHash, CLIP, and ELA.',
  },
  {
    href: '/forensics', icon: Microscope, color: '#d29922',
    label: 'Forensics',
    desc:  'Deep single-image analysis — ELA heatmap, EXIF, edit probability.',
  },
];

const TECH = [
  { icon: ScanLine,  color: '#3fb950', label: 'Perceptual Hash (pHash)',  value: 'DCT-based 64-bit fingerprint' },
  { icon: Cpu,       color: '#58a6ff', label: 'CLIP Embeddings',          value: '512-dim neural vector (OpenAI CLIP)' },
  { icon: ScanLine,  color: '#d29922', label: 'Error Level Analysis',     value: 'JPEG recompression delta heatmap' },
  { icon: Globe,     color: '#f85149', label: 'Google Vision API',        value: 'Web Detection — billions of pages' },
  { icon: Hash,      color: '#8b949e', label: 'SHA-256',                  value: 'Cryptographic byte-exact identity' },
  { icon: Database,  color: '#3fb950', label: 'MongoDB Atlas',            value: 'Persistent provenance graph store' },
  { icon: Zap,       color: '#58a6ff', label: 'Cloudinary CDN',           value: 'Image hosting + ELA heatmap storage' },
  { icon: TreePine,  color: '#d29922', label: 'React Flow',               value: 'Interactive directed graph rendering' },
  { icon: Layers,    color: '#3fb950', label: 'Next.js App Router',       value: 'Full-stack React framework' },
  { icon: Binary,    color: '#8b949e', label: 'Python CLIP Service',      value: 'Sidecar microservice for embeddings' },
];

const ANALYZE_STEPS = [
  { n: '1',  color: '#3fb950', title: 'Parse & validate',           detail: 'Accept file upload or URL. Validate MIME type, size (max 10 MB), and image integrity.' },
  { n: '2',  color: '#3fb950', title: 'Generate fingerprints',      detail: 'Compute SHA-256 cryptographic hash, 64-bit pHash via DCT, and 512-dim CLIP neural embedding.' },
  { n: '3',  color: '#3fb950', title: 'Exact duplicate check',      detail: 'Query MongoDB for matching SHA-256. Return cached result immediately if found.' },
  { n: '4',  color: '#58a6ff', title: 'Similarity search',          detail: 'Compute pHash Hamming distance and CLIP cosine similarity against 200 most recent nodes.' },
  { n: '5',  color: '#58a6ff', title: 'Upload to Cloudinary',       detail: 'Deterministic public_id (SHA-256 prefix) prevents redundant re-uploads.' },
  { n: '6',  color: '#d29922', title: 'ELA analysis',               detail: 'Recompress at 95% JPEG quality, compute absolute pixel difference to produce heatmap.' },
  { n: '7',  color: '#d29922', title: 'Edit assessment',            detail: 'Weighted combination of EXIF signals, ELA score, and CLIP drift to produce edit probability.' },
  { n: '8',  color: '#f85149', title: 'Google Vision search',       detail: 'Web Detection finds full matches, partial matches, and visually similar images.' },
  { n: '9',  color: '#f85149', title: 'Batch analyze copies',       detail: 'Download and fingerprint every discovered image. Re-run ELA + EXIF assessment.' },
  { n: '10', color: '#8b949e', title: 'Build relationship graph',   detail: 'Assign parent/child edges by pHash distance and CLIP similarity. Compute tree depth.' },
  { n: '11', color: '#8b949e', title: 'Persist & return tree',      detail: 'Upsert all ImageNodes into MongoDB. Return nested TreeJSON for React Flow rendering.' },
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
                  It combines cryptographic hashing, perceptual fingerprinting, neural semantic
                  embeddings (CLIP), error-level analysis (ELA), EXIF forensics, and Google
                  Vision reverse-image search into a single automated pipeline.
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
            title="Image Analyzer — 11-step pipeline"
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
            title="How edit detection works"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                icon: ScanLine,  color: '#d29922',
                title: 'Error Level Analysis',
                body:  'The image is re-saved at 95% JPEG quality. Regions that were edited after the last save will show higher error levels than untouched areas. The pixel-by-pixel difference is amplified into a visible heatmap.',
              },
              {
                icon: Binary, color: '#8b949e',
                title: 'EXIF Signal',
                body:  'Metadata fields are analyzed for inconsistencies — photo editing software tags (Photoshop, GIMP, Lightroom), mismatched timestamps, missing camera fields that genuine camera photos always contain.',
              },
              {
                icon: Cpu, color: '#58a6ff',
                title: 'CLIP Signal',
                body:  'A 512-dimensional neural embedding captures semantic image content. When a discovered copy drifts semantically from the uploaded image, it suggests cropping, color grading, or object insertion.',
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
                { icon: Globe,      color: '#f85149', text: 'Google Vision requires billing to be enabled on the GCP project. Without it, Vision returns no results and the tree will always have a single node.' },
                { icon: ScanLine,   color: '#d29922', text: 'ELA is most reliable on JPEG images. PNG files use lossless compression, so ELA scores may be inflated even for unedited images.' },
                { icon: Cpu,        color: '#58a6ff', text: 'CLIP similarity is only computed when the Python sidecar service is running. If offline, the system falls back to pHash-only matching.' },
                { icon: ShieldCheck,color: '#8b949e', text: 'Edit detection produces a probability estimate, not a definitive verdict. A high score indicates likelihood of editing, not proof.' },
                { icon: Database,   color: '#3fb950', text: 'The duplicate scanner only searches the 200 most recently uploaded nodes for performance. Very large databases may miss older near-duplicates.' },
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
