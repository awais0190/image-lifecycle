'use client';

/**
 * Image Analyzer — /analyze
 *
 *  - XHR upload progress bar (0–100%) for file uploads
 *  - Cancel button (AbortController) during analysis
 *  - Keyboard shortcuts: Escape → close NodeCard
 *  - CLIP health check with retry (3 attempts, 2s gap) — prevents false offline banner
 *  - Auto-clear CLIP offline state when analysis returns a real 512-dim embedding
 *  - AnalysisResultCard: thumbnail + verdict + edit-prob bar + key metrics
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence }                  from 'framer-motion';
import Link from 'next/link';
import {
  X, AlertCircle, CheckCircle2, AlertTriangle,
  GitCompareArrows, Layers, RefreshCw,
  ShieldCheck, ShieldAlert, Clock, Copy, Check,
  Cpu, Image as ImageIcon,
} from 'lucide-react';

import UploadCard      from '@/components/upload/UploadCard';
import TreeCanvas      from '@/components/tree/TreeCanvas';
import ForensicsPanel  from '@/components/forensics/ForensicsPanel';
import NodeCard        from '@/components/tree/NodeCard';
import TreeStats       from '@/components/tree/TreeStats';
import ErrorBoundary   from '@/components/shared/ErrorBoundary';

import type { AnalysisResult, ImageNode, TreeJSON, TreeStats as TStats } from '@/types/image';
import { API_PATHS } from '@/lib/utils/constants';

// ─── Processing steps ─────────────────────────────────────────────────────────

const PROCESSING_STEPS = [
  '📁 Uploading image to cloud…',
  '🔍 Searching the internet for copies…',
  '📥 Downloading discovered images…',
  '🧬 Analyzing fingerprints + ELA…',
  '🔗 Building relationship graph…',
  '🌳 Constructing lineage tree…',
] as const;

// ─── CLIP offline banner ──────────────────────────────────────────────────────

function ClipOfflineBanner({
  onDismiss,
  onRecheck,
  rechecking,
}: {
  onDismiss:  () => void;
  onRecheck:  () => void;
  rechecking: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-4 py-2.5 text-sm shrink-0"
      style={{
        background:   'rgba(210,153,34,0.08)',
        borderBottom: '1px solid rgba(210,153,34,0.2)',
      }}
    >
      <AlertTriangle size={14} style={{ color: '#d29922', flexShrink: 0 }} />
      <p className="flex-1 text-xs" style={{ color: '#d29922' }}>
        CLIP similarity service is offline — using pHash-only matching. Results may be less accurate.
      </p>
      <button
        onClick={onRecheck}
        disabled={rechecking}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ color: '#d29922', border: '1px solid rgba(210,153,34,0.3)' }}
      >
        <RefreshCw size={10} className={rechecking ? 'animate-spin' : ''} />
        {rechecking ? 'Checking…' : 'Re-check'}
      </button>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 hover:opacity-70 transition-opacity"
        style={{ color: '#d29922' }}
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

// ─── Vision search failed banner ──────────────────────────────────────────────

function VisionFailedBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const isBilling = message.toLowerCase().includes('billing');
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 px-4 py-2.5 text-sm shrink-0"
      style={{
        background:   'rgba(248,81,73,0.06)',
        borderBottom: '1px solid rgba(248,81,73,0.2)',
      }}
    >
      <AlertCircle size={14} style={{ color: '#f85149', flexShrink: 0, marginTop: 1 }} />
      <p className="flex-1 text-xs" style={{ color: '#f85149' }}>
        {isBilling
          ? 'Google Vision API: billing not enabled on your Google Cloud project. Tree will only show the uploaded image.'
          : `Reverse image search failed: ${message}. Showing local analysis only.`}
      </p>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 hover:opacity-70 transition-opacity"
        style={{ color: '#f85149' }}
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message, type, onDismiss,
}: { message: string; type: 'error' | 'success' | 'info'; onDismiss: () => void }) {
  const borderColor =
    type === 'error'   ? '#f8514933'
    : type === 'success' ? '#3fb95033'
    : '#30363d';
  const bg =
    type === 'error'   ? '#1c1418'
    : type === 'success' ? '#141c18'
    : '#161b27';
  const Icon =
    type === 'error'   ? AlertCircle
    : type === 'success' ? CheckCircle2
    : AlertTriangle;
  const iconColor =
    type === 'error'   ? '#f85149'
    : type === 'success' ? '#3fb950'
    : '#d29922';

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,   scale: 1 }}
      exit={{    opacity: 0, y: -12, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 rounded-xl px-4 py-3 shadow-xl"
      style={{ background: bg, border: `1px solid ${borderColor}`, maxWidth: '420px' }}
    >
      <Icon size={16} style={{ color: iconColor, flexShrink: 0, marginTop: 1 }} />
      <p className="flex-1 text-sm" style={{ color: '#e6edf3' }}>{message}</p>
      <button onClick={onDismiss} className="rounded p-0.5 hover:opacity-70" style={{ color: '#484f58' }}>
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ─── Analysis Result Card ─────────────────────────────────────────────────────

interface ResultSummary {
  imageUrl:        string;
  verdict:         'original' | 'edited' | 'uncertain';
  editProbability: number;
  elaScore:        number;
  hasClip:         boolean;
  copies:          number;
  totalNodes:      number;
  processingMs:    number;
  format:          string;
  dimensions:      string;
}

function CopyHashButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator?.clipboard?.writeText?.(value)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <button
      onClick={handleCopy}
      title={value}
      className="flex items-center gap-1 font-mono text-xs hover:opacity-70 transition-opacity"
      style={{ color: '#8b949e' }}
    >
      <span>{value.slice(0, 14)}…</span>
      {copied ? <Check size={10} style={{ color: '#3fb950' }} /> : <Copy size={10} />}
    </button>
  );
}

function AnalysisResultCard({
  summary,
  cryptoHash,
  pHash,
}: {
  summary:    ResultSummary;
  cryptoHash: string;
  pHash:      string;
}) {
  const verdictColor =
    summary.verdict === 'original'  ? '#3fb950'
    : summary.verdict === 'edited'  ? '#f85149'
    : '#d29922';

  const verdictBg =
    summary.verdict === 'original'  ? 'rgba(63,185,80,0.08)'
    : summary.verdict === 'edited'  ? 'rgba(248,81,73,0.08)'
    : 'rgba(210,153,34,0.08)';

  const verdictBorder =
    summary.verdict === 'original'  ? 'rgba(63,185,80,0.25)'
    : summary.verdict === 'edited'  ? 'rgba(248,81,73,0.25)'
    : 'rgba(210,153,34,0.25)';

  const VerdictIcon =
    summary.verdict === 'original'  ? ShieldCheck
    : summary.verdict === 'edited'  ? ShieldAlert
    : AlertTriangle;

  const verdictLabel =
    summary.verdict === 'original'  ? 'Original Image'
    : summary.verdict === 'edited'  ? 'Edited Copy'
    : 'Uncertain';

  const editPct = Math.round(summary.editProbability * 100);
  const elaLabel = summary.elaScore >= 0.15 ? 'High' : summary.elaScore >= 0.07 ? 'Medium' : 'Low';
  const elaColor = summary.elaScore >= 0.15 ? '#f85149' : summary.elaScore >= 0.07 ? '#d29922' : '#3fb950';
  const processingLabel = summary.processingMs >= 1000
    ? `${(summary.processingMs / 1000).toFixed(1)}s`
    : `${summary.processingMs}ms`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
      className="overflow-hidden rounded-xl"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      {/* Thumbnail + verdict */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #30363d' }}>
        {/* Image thumbnail */}
        <div
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
          style={{ border: '1px solid #30363d', background: '#0d1117' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={summary.imageUrl}
            alt="Analyzed image"
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ display: 'none' }}
          >
            <ImageIcon size={20} style={{ color: '#484f58' }} />
          </div>
        </div>

        {/* Verdict */}
        <div className="flex-1 min-w-0">
          <div
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: verdictBg, border: `1px solid ${verdictBorder}`, color: verdictColor }}
          >
            <VerdictIcon size={11} />
            {verdictLabel}
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: '#8b949e' }}>
            <span>{summary.format.toUpperCase()} · {summary.dimensions}</span>
            <span className="flex items-center gap-1" style={{ color: '#484f58' }}>
              <Clock size={10} />
              {processingLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Edit probability bar */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #30363d' }}>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span style={{ color: '#8b949e' }}>Edit Probability</span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: editPct >= 65 ? '#f85149' : editPct >= 35 ? '#d29922' : '#3fb950' }}
          >
            {editPct}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: '#21262d' }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: editPct >= 65
                ? 'linear-gradient(90deg, #c0392b, #f85149)'
                : editPct >= 35
                ? 'linear-gradient(90deg, #b08000, #d29922)'
                : 'linear-gradient(90deg, #1E8449, #3fb950)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${editPct}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' as const, delay: 0.1 }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs" style={{ color: '#484f58' }}>
          <span>Original</span>
          <span>Uncertain</span>
          <span>Edited</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 divide-x" style={{ borderBottom: '1px solid #30363d', borderColor: '#30363d' }}>
        {[
          {
            label: 'ELA',
            value: elaLabel,
            color: elaColor,
            sub:   `Score ${summary.elaScore.toFixed(3)}`,
          },
          {
            label: 'CLIP',
            value: summary.hasClip ? 'Online' : 'Offline',
            color: summary.hasClip ? '#3fb950' : '#484f58',
            sub:   summary.hasClip ? '512-dim' : 'pHash only',
          },
          {
            label: 'Copies',
            value: String(summary.copies),
            color: summary.copies > 0 ? '#58a6ff' : '#8b949e',
            sub:   `${summary.totalNodes} node${summary.totalNodes !== 1 ? 's' : ''}`,
          },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="flex flex-col items-center gap-0.5 px-2 py-2.5">
            <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
            <span className="text-xs" style={{ color: '#484f58' }}>{label}</span>
            <span className="text-xs" style={{ color: '#30363d' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Fingerprints */}
      <div className="space-y-0 divide-y" style={{ borderColor: '#21262d' }}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#484f58' }}>
            <Cpu size={10} />
            <span>SHA-256</span>
          </div>
          <CopyHashButton value={cryptoHash} />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#484f58' }}>
            <Cpu size={10} />
            <span>pHash</span>
          </div>
          <CopyHashButton value={pHash} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const [isAnalyzing,           setIsAnalyzing]           = useState(false);
  const [uploadPercent,         setUploadPercent]         = useState(0);
  const [treeData,              setTreeData]              = useState<TreeJSON | null>(null);
  const [treeStats,             setTreeStats]             = useState<TStats | null>(null);
  const [selectedNode,          setSelectedNode]          = useState<ImageNode | null>(null);
  const [selectedTree,          setSelectedTree]          = useState<TreeJSON | null>(null);
  const [selectedNodeHash,      setSelectedNodeHash]      = useState<string | null>(null);
  const [processingStep,        setProcessingStep]        = useState(0);
  const [toast,                 setToast]                 = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [clipOffline,           setClipOffline]           = useState(false);
  const [clipBannerDismissed,   setClipBannerDismissed]   = useState(false);
  const [clipRechecking,        setClipRechecking]        = useState(false);
  const [visionFailed,          setVisionFailed]          = useState(false);
  const [visionError,           setVisionError]           = useState('');
  const [visionBannerDismissed, setVisionBannerDismissed] = useState(false);
  const [resultSummary,         setResultSummary]         = useState<ResultSummary | null>(null);
  const [resultCryptoHash,      setResultCryptoHash]      = useState('');
  const [resultPHash,           setResultPHash]           = useState('');
  const [unrelatedImages,       setUnrelatedImages]       = useState<{ url: string; platform: string; pHashDistance: number }[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const xhrRef             = useRef<XMLHttpRequest | null>(null);

  // ── CLIP health check with retry ──────────────────────────────────────────
  const checkClipHealth = useCallback(async (showRechecking = false) => {
    if (showRechecking) setClipRechecking(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 2000));
      try {
        const res  = await fetch(API_PATHS.HEALTH_CLIP);
        const data = await res.json() as { available: boolean };
        if (data.available) {
          setClipOffline(false);
          setClipBannerDismissed(false);
          if (showRechecking) setClipRechecking(false);
          return;
        }
      } catch { /* retry */ }
    }
    setClipOffline(true);
    if (showRechecking) setClipRechecking(false);
  }, []);

  useEffect(() => { void checkClipHealth(); }, [checkClipHealth]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape' && selectedTree) {
        setSelectedTree(null);
        setSelectedNodeHash(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTree]);

  // Cycle through steps during analysis
  useEffect(() => {
    if (!isAnalyzing) { setProcessingStep(0); return; }
    const iv = setInterval(() => {
      setProcessingStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 4000);
    return () => clearInterval(iv);
  }, [isAnalyzing]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function resetState() {
    setTreeData(null);
    setTreeStats(null);
    setSelectedNode(null);
    setSelectedTree(null);
    setSelectedNodeHash(null);
    setVisionFailed(false);
    setVisionError('');
    setVisionBannerDismissed(false);
    setUploadPercent(0);
    setResultSummary(null);
    setResultCryptoHash('');
    setResultPHash('');
    setUnrelatedImages([]);
  }

  // ── File upload via XHR ────────────────────────────────────────────────────
  async function runFileAnalysis(file: File) {
    resetState();
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('image', file);

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const ac = new AbortController();
      abortControllerRef.current = ac;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        xhrRef.current = null;
        try {
          const data = JSON.parse(xhr.responseText) as AnalysisResult & {
            error?: string; visionSearchFailed?: boolean; visionError?: string;
          };
          if (xhr.status < 200 || xhr.status >= 300) {
            setToast({ message: data.error ?? 'Analysis failed — please try again.', type: 'error' });
          } else {
            handleAnalysisSuccess(data, file.name);
          }
        } catch {
          setToast({ message: 'Unexpected server response.', type: 'error' });
        }
        setIsAnalyzing(false);
        resolve();
      };

      xhr.onerror = () => {
        xhrRef.current = null;
        setToast({ message: 'Network error — please check your connection.', type: 'error' });
        setIsAnalyzing(false);
        resolve();
      };

      xhr.onabort = () => {
        xhrRef.current = null;
        setToast({ message: 'Analysis cancelled.', type: 'info' });
        setIsAnalyzing(false);
        resolve();
      };

      ac.signal.addEventListener('abort', () => xhr.abort());
      xhr.open('POST', '/api/images/analyze');
      xhr.send(formData);
    });
  }

  // ── URL analysis ──────────────────────────────────────────────────────────
  async function runUrlAnalysis(url: string) {
    resetState();
    setIsAnalyzing(true);

    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      const res  = await fetch('/api/images/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url }),
        signal:  ac.signal,
      });
      const data = await res.json() as AnalysisResult & {
        error?: string; visionSearchFailed?: boolean; visionError?: string;
      };
      if (!res.ok) {
        setToast({ message: data.error ?? 'Analysis failed — please try again.', type: 'error' });
      } else {
        handleAnalysisSuccess(data, new URL(url).hostname);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setToast({ message: 'Analysis cancelled.', type: 'info' });
      } else {
        setToast({ message: 'Network error — please check your connection.', type: 'error' });
      }
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleAnalysisSuccess(
    data: AnalysisResult & {
      error?: string; visionSearchFailed?: boolean; visionError?: string; processingTime?: number;
      unrelatedImages?: { url: string; platform: string; pHashDistance: number }[];
    },
    sourceLabel: string
  ) {
    setTreeData(data.tree ?? null);
    setTreeStats(data.stats ?? null);
    setSelectedNode(data.node ?? null);
    setUnrelatedImages(data.unrelatedImages ?? []);

    if (data.visionSearchFailed) {
      setVisionFailed(true);
      setVisionError(data.visionError ?? 'Reverse image search unavailable');
    }

    // ── Auto-clear CLIP offline if analysis used CLIP ──────────────────────
    if (Array.isArray(data.node?.clipEmbedding) && data.node.clipEmbedding.length === 512) {
      setClipOffline(false);
    }

    // ── Build result summary card ──────────────────────────────────────────
    const node    = data.node;
    const total   = data.stats?.totalNodes ?? 1;

    if (node) {
      const hasClip = Array.isArray(node.clipEmbedding) && node.clipEmbedding.length === 512;
      const w = node.metadata.width  ?? 0;
      const h = node.metadata.height ?? 0;

      setResultSummary({
        imageUrl:        node.cloudinaryUrl,
        verdict:         node.forensics.editVerdict ?? (node.forensics.isEdited ? 'edited' : 'original'),
        editProbability: node.forensics.editProbability ?? (node.forensics.isEdited ? 0.7 : 0.1),
        elaScore:        node.forensics.elaScore ?? 0,
        hasClip,
        copies:          Math.max(0, total - 1), // tree copies (excludes root node)
        totalNodes:      total,
        processingMs:    (data as { processingTime?: number }).processingTime ?? 0,
        format:          node.metadata.format ?? 'jpeg',
        dimensions:      w && h ? `${w}×${h}` : '—',
      });
      setResultCryptoHash(node.cryptoHash ?? '');
      setResultPHash(node.hash ?? '');
    }

    // ── Toast + page title ─────────────────────────────────────────────────
    const platforms = data.stats?.platforms?.length ?? 0;

    if (data.status === 'duplicate') {
      setToast({ message: 'This image was already analyzed. Showing existing tree.', type: 'info' });
    } else {
      const treeCopies = Math.max(0, total - 1);
      setToast({
        message: treeCopies > 0
          ? `Found ${treeCopies} cop${treeCopies !== 1 ? 'ies' : 'y'} of "${sourceLabel}" across ${platforms} platform${platforms !== 1 ? 's' : ''}`
          : `No copies of "${sourceLabel}" found on the web.`,
        type: 'success',
      });
    }

    if (typeof document !== 'undefined') {
      const treeCopies = Math.max(0, total - 1);
      document.title = treeCopies > 0
        ? `ImageTrace — ${sourceLabel} — ${treeCopies} cop${treeCopies !== 1 ? 'ies' : 'y'} found`
        : `ImageTrace — ${sourceLabel} — Original`;
    }
  }

  function handleCancelAnalysis() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    xhrRef.current?.abort();
    xhrRef.current = null;
  }

  const handleNodeClick = useCallback((node: TreeJSON) => {
    setSelectedTree(node);
    setSelectedNodeHash(node.hash);
    setSelectedNode({
      hash:               node.hash,
      cryptoHash:         '',
      clipEmbedding:      [],
      cloudinaryUrl:      node.cloudinaryUrl,
      cloudinaryPublicId: '',
      metadata:           node.metadata,
      forensics:          node.forensics,
      sources:            node.sources,
      parentHash:         null,
      children:           node.children.map((c) => c.hash),
      depth:              node.depth,
      uploadedAt:         new Date(),
    });
  }, []);

  const showClipBanner   = clipOffline && !clipBannerDismissed;
  const showVisionBanner = visionFailed && !visionBannerDismissed;
  const isSingleNodeTree = treeData && treeStats && treeStats.totalNodes === 1;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">

      {/* ── Banners ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showClipBanner && (
          <ClipOfflineBanner
            key="clip-banner"
            onDismiss={() => setClipBannerDismissed(true)}
            onRecheck={() => void checkClipHealth(true)}
            rechecking={clipRechecking}
          />
        )}
        {showVisionBanner && (
          <VisionFailedBanner
            key="vision-banner"
            message={visionError}
            onDismiss={() => setVisionBannerDismissed(true)}
          />
        )}
      </AnimatePresence>

      <div className="relative flex flex-1 overflow-hidden lg:flex-row flex-col">

        {/* ── Toast ────────────────────────────────────────────────────────── */}
        <div className="absolute left-1/2 top-4 z-60 -translate-x-1/2 pointer-events-none">
          <AnimatePresence>
            {toast && (
              <div className="pointer-events-auto">
                <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Loading overlay ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6"
              style={{ background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(8px)' }}
            >
              {/* Upload progress bar */}
              {uploadPercent > 0 && uploadPercent < 100 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-64 space-y-1"
                >
                  <div className="flex justify-between text-xs" style={{ color: '#8b949e' }}>
                    <span>Uploading…</span>
                    <span>{uploadPercent}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full" style={{ background: '#30363d' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #1E8449, #3fb950)' }}
                      animate={{ width: `${uploadPercent}%` }}
                      transition={{ ease: 'easeOut' as const, duration: 0.2 }}
                    />
                  </div>
                </motion.div>
              )}

              <div className="relative flex items-center justify-center">
                <div
                  className="absolute h-24 w-24 rounded-full"
                  style={{ background: 'rgba(30,132,73,0.06)', border: '1px solid rgba(30,132,73,0.18)' }}
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="h-10 w-10 rounded-full"
                  style={{ border: '2px solid #30363d', borderTopColor: '#3fb950' }}
                />
              </div>

              <div className="text-center space-y-1.5">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={processingStep}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="text-base font-semibold"
                    style={{ color: '#e6edf3' }}
                  >
                    {PROCESSING_STEPS[processingStep]}
                  </motion.p>
                </AnimatePresence>
                <p className="text-sm" style={{ color: '#8b949e' }}>
                  This may take 20–60 seconds for Vision search + downloads
                </p>
              </div>

              <div className="flex flex-wrap justify-center items-center gap-2 text-xs max-w-md">
                {['Upload', 'Vision', 'Download', 'ELA+CLIP', 'Graph', 'Tree'].map((step, i) => (
                  <span key={step} className="flex items-center gap-1.5">
                    <span
                      className="rounded px-2.5 py-1 transition-colors"
                      style={{
                        background: i <= processingStep ? 'rgba(30,132,73,0.12)' : '#161b27',
                        border:     `1px solid ${i <= processingStep ? 'rgba(30,132,73,0.3)' : '#30363d'}`,
                        color:      i <= processingStep ? '#3fb950' : '#484f58',
                      }}
                    >
                      {step}
                    </span>
                    {i < 5 && <span style={{ color: '#30363d' }}>→</span>}
                  </span>
                ))}
              </div>

              <button
                onClick={handleCancelAnalysis}
                className="mt-2 rounded-lg px-4 py-2 text-sm transition-all hover:opacity-80 active:scale-95"
                style={{
                  background: 'rgba(248,81,73,0.08)',
                  border:     '1px solid rgba(248,81,73,0.2)',
                  color:      '#f85149',
                }}
              >
                Cancel analysis
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Left panel ─────────────────────────────────────────────────────── */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' as const }}
          className="flex flex-col gap-3 overflow-y-auto p-4 lg:w-95 lg:shrink-0 lg:p-5"
          style={{ borderRight: '1px solid #30363d' }}
        >
          <UploadCard
            onFileSelect={(f) => void runFileAnalysis(f)}
            onUrlSubmit={(u) => void runUrlAnalysis(u)}
            isLoading={isAnalyzing}
            disabled={isAnalyzing}
          />

          {/* Quick-access cards */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/compare', label: 'Compare', sub: 'Side-by-side', icon: GitCompareArrows, color: '#58a6ff' },
              { href: '/batch',   label: 'Batch',   sub: 'Multi-image',  icon: Layers,          color: '#d29922' },
            ].map(({ href, label, sub, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                >
                  <Icon size={14} style={{ color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-tight" style={{ color: '#e6edf3' }}>{label}</p>
                  <p className="text-xs leading-tight" style={{ color: '#484f58' }}>{sub}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Analysis Result Card */}
          <AnimatePresence>
            {resultSummary && !isAnalyzing && (
              <AnalysisResultCard
                key="result-card"
                summary={resultSummary}
                cryptoHash={resultCryptoHash}
                pHash={resultPHash}
              />
            )}
          </AnimatePresence>

          {/* Tree summary */}
          <AnimatePresence>
            {treeStats && !isAnalyzing && treeStats.totalNodes > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
                  Provenance Tree
                </p>
                <TreeStats stats={treeStats} />
              </motion.div>
            )}
          </AnimatePresence>

          <ErrorBoundary>
            <ForensicsPanel node={selectedNode} isLoading={isAnalyzing} />
          </ErrorBoundary>

          <div className="mt-auto pt-2">
            <p className="text-center text-xs" style={{ color: '#484f58' }}>
               · ELA · CLIP · Provenance Tree
            </p>
          </div>
        </motion.aside>

        {/* ── Right panel ──────────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative flex flex-1 flex-col p-4 lg:p-5"
          style={{ minHeight: '400px' }}
        >
          <div className="mb-3 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
              Provenance Tree
            </span>
            <div className="flex items-center gap-2">
              {selectedTree && (
                <span className="text-xs" style={{ color: '#484f58' }}>
                  Press{' '}
                  <kbd
                    className="rounded px-1 py-0.5 text-xs font-mono"
                    style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e' }}
                  >
                    Esc
                  </kbd>{' '}
                  to close
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs" style={{ color: '#484f58' }}>
                <span
                  className="h-1.5 w-1.5 rounded-full transition-all"
                  style={{
                    background: isAnalyzing ? '#3fb950' : treeData ? '#3fb950' : '#484f58',
                    boxShadow:  isAnalyzing ? '0 0 6px #3fb950' : 'none',
                  }}
                />
                {isAnalyzing
                  ? 'Processing'
                  : treeData
                  ? `${treeStats?.totalNodes ?? 1} node${(treeStats?.totalNodes ?? 1) !== 1 ? 's' : ''}`
                  : 'Idle'}
              </div>
            </div>
          </div>

          <ErrorBoundary>
            <TreeCanvas
              tree={treeData}
              onNodeClick={handleNodeClick}
              isLoading={isAnalyzing}
              selectedNodeHash={selectedNodeHash}
              className="flex-1"
            />
          </ErrorBoundary>

          {/* Single-node tree message */}
          <AnimatePresence>
            {isSingleNodeTree && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 shrink-0 rounded-xl px-4 py-3 text-center"
                style={{ background: 'rgba(30,132,73,0.06)', border: '1px solid rgba(30,132,73,0.18)' }}
              >
                <p className="text-xs font-medium" style={{ color: '#3fb950' }}>
                  No copies found on the internet
                </p>
                <p className="mt-0.5 text-xs" style={{ color: '#484f58' }}>
                  This image appears to be original or very new.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unrelated images — excluded from tree */}
          <AnimatePresence>
            {unrelatedImages.length > 0 && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 shrink-0 rounded-xl overflow-hidden"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #21262d' }}>
                  <AlertTriangle size={13} style={{ color: '#484f58' }} />
                  <span className="text-xs font-semibold" style={{ color: '#484f58' }}>
                    {unrelatedImages.length} unrelated image{unrelatedImages.length !== 1 ? 's' : ''} found on web — excluded from tree
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  {unrelatedImages.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${img.platform} · pHash Δ${img.pHashDistance}`}
                      className="group relative overflow-hidden rounded-lg transition-opacity hover:opacity-80"
                      style={{ width: 52, height: 52, background: '#0d1117', border: '1px solid #30363d', flexShrink: 0 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div
                        className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(13,17,23,0.7)' }}
                      >
                        <span className="text-[9px] font-mono" style={{ color: '#8b949e' }}>Δ{img.pHashDistance}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedTree && (
              <NodeCard node={selectedTree} onClose={() => { setSelectedTree(null); setSelectedNodeHash(null); }} />
            )}
          </AnimatePresence>
        </motion.section>

      </div>
    </div>
  );
}
