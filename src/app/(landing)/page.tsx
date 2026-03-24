'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ScanSearch, GitCompareArrows, Layers, ArrowRight,
  Globe, ShieldCheck, Cpu, Database, Zap,
  ScanLine, TreePine, Binary, ChevronRight,
} from 'lucide-react';

// ─── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const, delay: i * 0.1 },
  }),
};

// ─── Noise / grid background ───────────────────────────────────────────────────

function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* dot grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(circle, #8b949e 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* top-left glow */}
      <div
        className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(30,132,73,0.18) 0%, transparent 70%)' }}
      />
      {/* bottom-right glow */}
      <div
        className="absolute -bottom-60 -right-40 h-[700px] w-[700px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(88,166,255,0.10) 0%, transparent 70%)' }}
      />
    </div>
  );
}

// ─── Minimal nav ───────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      className="relative z-20 mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10"
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'rgba(30,132,73,0.15)', border: '1px solid rgba(30,132,73,0.35)' }}
        >
          <ScanSearch size={16} style={{ color: '#3fb950' }} />
        </div>
        <span className="text-sm font-bold tracking-tight" style={{ color: '#e6edf3' }}>
          Image<span style={{ color: '#3fb950' }}>Trace</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/analyze"
          className="rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150 hover:bg-white/5"
          style={{ color: '#8b949e' }}
        >
          Open App
        </Link>
        <Link
          href="/analyze"
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-150 hover:brightness-110"
          style={{ background: 'rgba(30,132,73,0.15)', border: '1px solid rgba(30,132,73,0.35)', color: '#3fb950' }}
        >
          Get Started
          <ChevronRight size={12} />
        </Link>
      </div>
    </nav>
  );
}

// ─── Tool card ─────────────────────────────────────────────────────────────────

interface Tool {
  href:        string;
  icon:        React.ElementType;
  color:       string;
  label:       string;
  badge?:      string;
  description: string;
  bullets:     string[];
  cta:         string;
}

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const Icon = tool.icon;
  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      className="group relative flex flex-col rounded-2xl p-6 transition-all duration-300"
      style={{
        background:   '#161b27',
        border:       '1px solid #30363d',
      }}
    >
      {/* hover glow border */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ border: `1px solid ${tool.color}40`, borderRadius: 'inherit' }}
      />

      {/* icon */}
      <div
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: `${tool.color}15`, border: `1px solid ${tool.color}30` }}
      >
        <Icon size={22} style={{ color: tool.color }} />
      </div>

      {/* label + badge */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-base font-bold" style={{ color: '#e6edf3' }}>{tool.label}</h3>
        {tool.badge && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: `${tool.color}15`, color: tool.color, border: `1px solid ${tool.color}30` }}
          >
            {tool.badge}
          </span>
        )}
      </div>

      {/* description */}
      <p className="mb-4 text-sm leading-relaxed" style={{ color: '#8b949e' }}>
        {tool.description}
      </p>

      {/* bullets */}
      <ul className="mb-6 flex-1 space-y-2">
        {tool.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-xs" style={{ color: '#484f58' }}>
            <span className="mt-0.5 shrink-0" style={{ color: tool.color }}>▸</span>
            {b}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={tool.href}
        className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
        style={{ background: `${tool.color}18`, border: `1px solid ${tool.color}35`, color: tool.color }}
      >
        {tool.cta}
        <ArrowRight size={14} />
      </Link>
    </motion.div>
  );
}

// ─── Step card ─────────────────────────────────────────────────────────────────

function StepCard({
  number, title, body, icon: Icon, delay,
}: { number: string; title: string; body: string; icon: React.ElementType; delay: number }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className="flex gap-4"
    >
      <div className="flex flex-col items-center">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)', color: '#3fb950' }}
        >
          {number}
        </div>
        <div className="mt-2 flex-1 w-px" style={{ background: 'linear-gradient(to bottom, #30363d, transparent)' }} />
      </div>
      <div className="pb-8">
        <div className="mb-1 flex items-center gap-2">
          <Icon size={14} style={{ color: '#3fb950' }} />
          <p className="text-sm font-semibold" style={{ color: '#e6edf3' }}>{title}</p>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: '#484f58' }}>{body}</p>
      </div>
    </motion.div>
  );
}

// ─── Tech pill ─────────────────────────────────────────────────────────────────

function TechPill({ label, icon: Icon, color }: { label: string; icon: React.ElementType; color: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-3.5 py-2"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      <Icon size={13} style={{ color }} />
      <span className="text-xs font-medium" style={{ color: '#8b949e' }}>{label}</span>
    </div>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    href:        '/analyze',
    icon:        ScanSearch,
    color:       '#3fb950',
    label:       'Image Analyzer',
    badge:       'Flagship',
    description: 'Full 16-step provenance pipeline. Upload any image and trace its entire digital lifecycle — from origin fingerprinting to internet-wide discovery and lineage tree.',
    bullets: [
      'SHA-256, pHash, dHash & CLIP 4-method fingerprinting',
      'CLIP zero-shot editing classification (15 prompts)',
      'DeepFace ArcFace face verification on discovered copies',
      'Google Vision Web Detection + interactive React Flow tree',
    ],
    cta: 'Start Tracing',
  },
  {
    href:        '/compare',
    icon:        GitCompareArrows,
    color:       '#58a6ff',
    label:       'Image Comparator',
    description: 'Place two images side by side and get a precise similarity verdict — from byte-identical to completely different — using multiple signals.',
    bullets: [
      'pHash + dHash dual perceptual hashing',
      'CLIP semantic similarity (512-dim neural)',
      'DeepFace ArcFace face matching',
      'Multi-scale crop / partial-match detection',
    ],
    cta: 'Compare Images',
  },
  {
    href:        '/batch',
    icon:        Layers,
    color:       '#d29922',
    label:       'Batch Analyzer',
    description: 'Upload 2–10 images and let the system find how they are all related — parent, child, or sibling — using multi-signal scoring.',
    bullets: [
      "Prim's MST tree over pHash + CLIP similarity matrix",
      'Weighted originality score (resolution, ELA, camera, date)',
      'ELA + EXIF + CLIP edit detection on every image',
      'Outlier detection for unrelated images',
    ],
    cta: 'Analyze Batch',
  },
];

const STEPS = [
  { number: '01', title: 'Upload or paste a URL',       body: 'Drag-drop a file or paste a public image URL. JPEG, PNG, WebP, and GIF supported up to 15 MB.', icon: Layers },
  { number: '02', title: 'Fingerprint in 4 ways',       body: 'SHA-256 (exact), pHash + dHash (perceptual), and a 512-dim CLIP ViT-B/32 neural embedding — all computed in parallel.', icon: Binary },
  { number: '03', title: 'Detect edits with 6 signals', body: 'ELA heatmap, EXIF software detection, visual heuristics, structural drift, CLIP semantic shift, and CLIP zero-shot classification vote together.', icon: ScanLine },
  { number: '04', title: 'Search the internet',         body: 'Google Vision Web Detection finds full, partial, and visually similar matches across billions of pages. Each copy is individually fingerprinted and face-verified.', icon: Globe },
  { number: '05', title: 'Build the lineage tree',      body: 'A weighted scoring model (date, pHash, CLIP, match type, crop detection) assigns parent-child edges — forming a directed provenance graph rendered in React Flow.', icon: TreePine },
];

const TECH = [
  { label: 'CLIP ViT-B/32',      icon: Cpu,         color: '#58a6ff' },
  { label: 'DeepFace ArcFace',   icon: ShieldCheck, color: '#3fb950' },
  { label: 'ELA Analysis',       icon: ScanLine,    color: '#d29922' },
  { label: 'Google Vision',      icon: Globe,       color: '#f85149' },
  { label: 'pHash + dHash',      icon: ScanLine,    color: '#3fb950' },
  { label: 'MongoDB Atlas',      icon: Database,    color: '#3fb950' },
  { label: 'Cloudinary CDN',     icon: Zap,         color: '#58a6ff' },
  { label: 'SHA-256',            icon: ShieldCheck, color: '#8b949e' },
  { label: 'React Flow Graph',   icon: TreePine,    color: '#d29922' },
  { label: 'FastAPI ML Service', icon: Cpu,         color: '#f85149' },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden" style={{ color: '#e6edf3' }}>
      <GridBackground />

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-16 text-center lg:px-10 lg:pt-24">

        {/* pill badge */}
        <motion.div
          variants={fadeUp}
          custom={0}
          initial="hidden"
          animate="visible"
          className="mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{ background: 'rgba(30,132,73,0.08)', border: '1px solid rgba(30,132,73,0.25)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3fb950', boxShadow: '0 0 6px #3fb950' }} />
          <span className="text-xs font-medium" style={{ color: '#3fb950' }}>Image Forensics & Provenance Platform</span>
        </motion.div>

        {/* headline */}
        <motion.h1
          variants={fadeUp}
          custom={1}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
          style={{ color: '#e6edf3', lineHeight: 1.15 }}
        >
          Trace the lifecycle of{' '}
          <span
            className="relative inline-block"
            style={{
              background: 'linear-gradient(135deg, #3fb950 0%, #58a6ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            any image
          </span>
        </motion.h1>

        {/* subtext */}
        <motion.p
          variants={fadeUp}
          custom={2}
          initial="hidden"
          animate="visible"
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
          style={{ color: '#8b949e' }}
        >
          Discover where an image originated, how it was edited, and where it spread.
          Six edit-detection signals — CLIP zero-shot classification, DeepFace ArcFace
          verification, ELA, perceptual hashing, EXIF forensics, and Google Vision
          reverse search — unified in one automated 16-step pipeline.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          variants={fadeUp}
          custom={3}
          initial="hidden"
          animate="visible"
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Link
            href="/analyze"
            className="flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #1E8449 0%, #27ae60 100%)',
              color:  '#fff',
              border: '1px solid rgba(30,132,73,0.5)',
              boxShadow: '0 0 24px rgba(30,132,73,0.25)',
            }}
          >
            <ScanSearch size={16} />
            Start Tracing an Image
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/batch"
            className="flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold transition-all duration-150 hover:bg-white/5"
            style={{ color: '#8b949e', border: '1px solid #30363d' }}
          >
            <Layers size={16} />
            Batch Analyze
          </Link>
        </motion.div>

        {/* stat pills */}
        <motion.div
          variants={fadeUp}
          custom={4}
          initial="hidden"
          animate="visible"
          className="mt-14 flex flex-wrap justify-center gap-3"
        >
          {[
            { value: '3',    label: 'Analysis Tools'   },
            { value: '6',    label: 'Edit Signals'     },
            { value: '16',   label: 'Pipeline Steps'   },
            { value: 'CLIP', label: 'Zero-Shot ML'     },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="rounded-xl px-5 py-2.5 text-center"
              style={{ background: '#161b27', border: '1px solid #30363d' }}
            >
              <p className="text-lg font-bold" style={{ color: '#e6edf3' }}>{value}</p>
              <p className="text-xs" style={{ color: '#484f58' }}>{label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Tools ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          variants={fadeUp}
          custom={0}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#3fb950' }}>
            Tools
          </p>
          <h2 className="text-2xl font-bold sm:text-3xl" style={{ color: '#e6edf3' }}>
            Everything you need in one place
          </h2>
          <p className="mt-3 text-sm" style={{ color: '#8b949e' }}>
            Three purpose-built tools, each solving a different facet of image intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, i) => <ToolCard key={tool.href} tool={tool} index={i} />)}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section
        className="relative z-10 border-y py-24"
        style={{ borderColor: '#21262d', background: 'rgba(22,27,39,0.5)' }}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-start">

            {/* left: text */}
            <motion.div
              variants={fadeUp}
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#3fb950' }}>
                How it works
              </p>
              <h2 className="mb-4 text-2xl font-bold sm:text-3xl" style={{ color: '#e6edf3' }}>
                16 steps. One upload. Full provenance.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: '#8b949e' }}>
                The Image Analyzer runs a 16-step automated pipeline — 4-method fingerprinting,
                6-signal edit detection (including CLIP zero-shot and DeepFace ArcFace), Google
                Vision reverse search, batch copy analysis, and weighted relationship graph
                construction — all triggered from a single image upload.
              </p>

              <div className="mt-8">
                <Link
                  href="/analyze"
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-150 hover:brightness-110"
                  style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)', color: '#3fb950' }}
                >
                  Try it now
                  <ArrowRight size={14} />
                </Link>
              </div>
            </motion.div>

            {/* right: steps */}
            <div>
              {STEPS.map((s, i) => (
                <StepCard key={s.number} {...s} delay={i * 0.08} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <motion.div
          variants={fadeUp}
          custom={0}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-10 text-center"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#484f58' }}>
            Under the hood
          </p>
          <h2 className="text-xl font-bold sm:text-2xl" style={{ color: '#e6edf3' }}>
            Powered by best-in-class technologies
          </h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          custom={1}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-2.5"
        >
          {TECH.map((t) => <TechPill key={t.label} {...t} />)}
        </motion.div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          variants={fadeUp}
          custom={0}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl px-8 py-14 text-center"
          style={{ background: '#161b27', border: '1px solid #30363d' }}
        >
          {/* glow */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-48 w-96 blur-[80px]"
            style={{ background: 'radial-gradient(ellipse, rgba(30,132,73,0.2) 0%, transparent 70%)' }}
          />

          <p className="relative mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#3fb950' }}>
            Get started free
          </p>
          <h2 className="relative mx-auto mb-4 max-w-xl text-2xl font-bold sm:text-3xl" style={{ color: '#e6edf3' }}>
            Start investigating your first image
          </h2>
          <p className="relative mx-auto mb-8 max-w-lg text-sm" style={{ color: '#8b949e' }}>
            No account required. Upload any image and get a full forensic report, provenance tree,
            and edit probability in under 30 seconds.
          </p>

          <div className="relative flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/analyze"
              className="flex items-center gap-2.5 rounded-xl px-8 py-3.5 text-sm font-semibold transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #1E8449 0%, #27ae60 100%)',
                color:  '#fff',
                border: '1px solid rgba(30,132,73,0.5)',
                boxShadow: '0 0 24px rgba(30,132,73,0.2)',
              }}
            >
              <ScanSearch size={15} />
              Open Image Analyzer
            </Link>
            <Link
              href="/compare"
              className="flex items-center gap-2.5 rounded-xl px-8 py-3.5 text-sm font-semibold transition-all duration-150 hover:bg-white/5"
              style={{ color: '#8b949e', border: '1px solid #30363d' }}
            >
              <GitCompareArrows size={15} />
              Compare Two Images
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        className="relative z-10 border-t"
        style={{ borderColor: '#21262d' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
          <div className="flex items-center gap-2">
            <ScanSearch size={14} style={{ color: '#3fb950' }} />
            <span className="text-xs font-bold" style={{ color: '#8b949e' }}>
              Image<span style={{ color: '#3fb950' }}>Trace</span>
            </span>
            <span className="text-xs" style={{ color: '#30363d' }}>· </span>
          </div>
          <div className="flex items-center gap-4">
            {[
              { href: '/analyze',   label: 'Analyzer'  },
              { href: '/compare',   label: 'Compare'   },
              { href: '/batch',     label: 'Batch'     },
              { href: '/history',   label: 'History'   },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-xs transition-colors hover:text-white"
                style={{ color: '#484f58' }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
