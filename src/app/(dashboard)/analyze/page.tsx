'use client';

/**
 * Dashboard Page — Phase 05
 * Full pipeline: upload → Vision search → tree render → node detail panel.
 *
 * Phase 05 additions:
 *  - XHR upload progress bar (0–100%) for file uploads
 *  - Cancel button (AbortController) during analysis
 *  - Keyboard shortcuts: Escape → close NodeCard, R → fit tree view
 *  - Page title updated after analysis
 *  - Second-upload state reset is clean (ForensicsPanel clears properly)
 *  - "No copies found" message for single-node trees
 *  - visionSearchFailed amber banner
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence }                  from 'framer-motion';
import Link from 'next/link';
import { X, AlertCircle, CheckCircle2, AlertTriangle, GitCompareArrows, Layers } from 'lucide-react';

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

function ClipOfflineBanner({ onDismiss }: { onDismiss: () => void }) {
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
        CLIP similarity service is offline. Using pHash-only matching. Results may be less accurate.
      </p>
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
          ? 'Google Vision API: billing not enabled on your Google Cloud project. Tree will only show the uploaded image. Enable billing at console.cloud.google.com to find web copies.'
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

// ─── Upload progress bar ──────────────────────────────────────────────────────

function UploadProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-0.5"
      style={{ background: '#30363d' }}
    >
      <motion.div
        className="h-full"
        style={{ background: 'linear-gradient(90deg, #1E8449, #3fb950)' }}
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ ease: 'easeOut', duration: 0.3 }}
      />
    </div>
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [isAnalyzing,           setIsAnalyzing]           = useState(false);
  const [uploadPercent,         setUploadPercent]         = useState(0);
  const [treeData,              setTreeData]              = useState<TreeJSON | null>(null);
  const [treeStats,             setTreeStats]             = useState<TStats | null>(null);
  const [selectedNode,          setSelectedNode]          = useState<ImageNode | null>(null);
  const [selectedTree,          setSelectedTree]          = useState<TreeJSON | null>(null);
  const [selectedNodeHash,      setSelectedNodeHash]      = useState<string | null>(null);
  const [processingStep,        setProcessingStep]        = useState(0);
  const [finalMessage,          setFinalMessage]          = useState('');
  const [toast,                 setToast]                 = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [clipOffline,           setClipOffline]           = useState(false);
  const [clipBannerDismissed,   setClipBannerDismissed]   = useState(false);
  const [visionFailed,          setVisionFailed]          = useState(false);
  const [visionError,           setVisionError]           = useState('');
  const [visionBannerDismissed, setVisionBannerDismissed] = useState(false);

  // Abort controller ref for cancelling in-progress analysis
  const abortControllerRef = useRef<AbortController | null>(null);
  const xhrRef             = useRef<XMLHttpRequest | null>(null);

  // Check CLIP service health on mount
  useEffect(() => {
    fetch(API_PATHS.HEALTH_CLIP)
      .then((r) => r.json())
      .then((data: { available: boolean }) => {
        if (!data.available) setClipOffline(true);
      })
      .catch(() => setClipOffline(true));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (selectedTree) {
          setSelectedTree(null);
          setSelectedNodeHash(null);
        }
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

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Reset state before each analysis
  function resetState() {
    setTreeData(null);
    setTreeStats(null);
    setSelectedNode(null);
    setSelectedTree(null);
    setSelectedNodeHash(null);
    setFinalMessage('');
    setVisionFailed(false);
    setVisionError('');
    setVisionBannerDismissed(false);
    setUploadPercent(0);
  }

  // ── File upload using XHR (for real progress %) ────────────────────────────
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

      // Upload progress (Phase 05)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadPercent(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        xhrRef.current = null;
        try {
          const data = JSON.parse(xhr.responseText) as AnalysisResult & { error?: string; visionSearchFailed?: boolean; visionError?: string };
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

      // Listen for abort signal
      ac.signal.addEventListener('abort', () => xhr.abort());

      xhr.open('POST', '/api/images/analyze');
      xhr.send(formData);
    });
  }

  // ── URL analysis using fetch + AbortController ─────────────────────────────
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
      const data = await res.json() as AnalysisResult & { error?: string; visionSearchFailed?: boolean; visionError?: string };

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
    data: AnalysisResult & { error?: string; visionSearchFailed?: boolean; visionError?: string },
    sourceLabel: string
  ) {
    setTreeData(data.tree ?? null);
    setTreeStats(data.stats ?? null);
    setSelectedNode(data.node ?? null);

    if (data.visionSearchFailed) {
      setVisionFailed(true);
      setVisionError(data.visionError ?? 'Reverse image search unavailable');
    }

    const found     = data.discoveredCount ?? 0;
    const platforms = data.stats?.platforms?.length ?? 0;
    const total     = data.stats?.totalNodes ?? 1;

    if (data.status === 'duplicate') {
      setToast({ message: 'This image was already analyzed. Showing existing tree.', type: 'info' });
      setFinalMessage('Duplicate detected — cached result');
    } else {
      setFinalMessage(
        found > 0
          ? `Found ${found} copies across ${platforms} platform${platforms !== 1 ? 's' : ''} — ${total} total nodes`
          : `No copies found online — ${total} node in tree`
      );
      setToast({
        message: found > 0
          ? `Found ${found} cop${found !== 1 ? 'ies' : 'y'} of "${sourceLabel}" across ${platforms} platform${platforms !== 1 ? 's' : ''}`
          : `No copies of "${sourceLabel}" found on the web.`,
        type: 'success',
      });
    }

    // Update page title
    if (typeof document !== 'undefined') {
      document.title = found > 0
        ? `ImageTrace — ${sourceLabel} — ${found} cop${found !== 1 ? 'ies' : 'y'} found`
        : `ImageTrace — ${sourceLabel} — Original`;
    }
  }

  function handleCancelAnalysis() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }

  function handleFileSelect(file: File) {
    void runFileAnalysis(file);
  }

  function handleUrlSubmit(url: string) {
    void runUrlAnalysis(url);
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

  function handleNodeCardClose() {
    setSelectedTree(null);
    setSelectedNodeHash(null);
  }

  const showClipBanner    = clipOffline && !clipBannerDismissed;
  const showVisionBanner  = visionFailed && !visionBannerDismissed;
  const isSingleNodeTree  = treeData && treeStats && treeStats.totalNodes === 1;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">

      {/* ── Banners ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showClipBanner && (
          <ClipOfflineBanner key="clip-banner" onDismiss={() => setClipBannerDismissed(true)} />
        )}
        {showVisionBanner && (
          <VisionFailedBanner key="vision-banner" message={visionError} onDismiss={() => setVisionBannerDismissed(true)} />
        )}
      </AnimatePresence>

      <div className="relative flex flex-1 overflow-hidden lg:flex-row flex-col">

        {/* ── Toast ──────────────────────────────────────────────────── */}
        <div className="absolute left-1/2 top-4 z-60 -translate-x-1/2 pointer-events-none">
          <AnimatePresence>
            {toast && (
              <div className="pointer-events-auto">
                <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Loading overlay ─────────────────────────────────────────── */}
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
              {/* Upload progress bar (visible during file upload) */}
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
                      transition={{ ease: 'easeOut', duration: 0.2 }}
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

              {/* Cancel button */}
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

        {/* ── Left panel ───────────────────────────────────────────────── */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex flex-col gap-3 overflow-y-auto p-4 lg:w-95 lg:shrink-0 lg:p-5"
          style={{ borderRight: '1px solid #30363d' }}
        >
          <UploadCard
            onFileSelect={handleFileSelect}
            onUrlSubmit={handleUrlSubmit}
            isLoading={isAnalyzing}
            disabled={isAnalyzing}
          />

          {/* ── Quick-access tool cards ──────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/compare', label: 'Compare', sub: 'Side-by-side', icon: GitCompareArrows, color: '#58a6ff' },
              { href: '/batch',   label: 'Batch',   sub: 'Multi-image',  icon: Layers,          color: '#d29922'  },
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

          <AnimatePresence>
            {treeStats && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
                  Tree Summary
                </p>
                <TreeStats stats={treeStats} />
                {finalMessage && (
                  <p className="mt-2 text-xs" style={{ color: '#8b949e' }}>{finalMessage}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <ErrorBoundary>
            <ForensicsPanel node={selectedNode} isLoading={isAnalyzing} />
          </ErrorBoundary>

          <div className="mt-auto pt-2">
            <p className="text-center text-xs" style={{ color: '#484f58' }}>
              Phase 05 · ELA · CLIP · Provenance Tree
            </p>
          </div>
        </motion.aside>

        {/* ── Right panel ──────────────────────────────────────────────── */}
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
                  Press <kbd
                    className="rounded px-1 py-0.5 text-xs font-mono"
                    style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e' }}
                  >Esc</kbd> to close
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
                {isAnalyzing ? 'Processing' : treeData ? `${treeStats?.totalNodes ?? 1} node${(treeStats?.totalNodes ?? 1) !== 1 ? 's' : ''}` : 'Idle'}
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

          <AnimatePresence>
            {selectedTree && (
              <NodeCard node={selectedTree} onClose={handleNodeCardClose} />
            )}
          </AnimatePresence>
        </motion.section>

      </div>
    </div>
  );
}
