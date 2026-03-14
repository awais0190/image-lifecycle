'use client';

/**
 * /compare — Side-by-side Image Comparator
 * Upload two images → get pHash distance, CLIP similarity, ELA heatmaps,
 * edit assessments, and a similarity verdict.
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence }       from 'framer-motion';
import {
  UploadCloud, X, AlertCircle, CheckCircle2,
  GitCompareArrows, Cpu, ScanLine, FileImage,
  ShieldCheck, ShieldAlert, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MAX_UPLOAD_SIZE_BYTES, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/constants';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImagePayload {
  cloudinaryUrl: string;
  pHash:         string;
  cryptoHash:    string;
  clipAvailable: boolean;
  metadata: {
    width: number; height: number; format: string;
    fileSize: number; dateCreated: string | null;
    camera: string | null; software: string | null;
  };
  ela: {
    score: number; heatmapUrl: string | null;
    isLikelyEdited: boolean; highDiffRegions: number;
  };
  assessment: {
    verdict: 'original' | 'edited' | 'uncertain';
    editProbability: number;
    overallConfidence: number;
    signals: {
      exif: { score: number; weight: number; reason: string };
      ela:  { score: number; weight: number; reason: string };
      clip: { score: number; weight: number; reason: string } | null;
    };
  };
}

interface CompareResult {
  imageA:     ImagePayload;
  imageB:     ImagePayload;
  comparison: {
    pHashDistance:   number;
    clipSimilarity:  number | null;
    cryptoHashMatch: boolean;
    verdict:         string;
    confidence:      number;
    description:     string;
  };
  processingTime: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function verdictStyle(verdict: string) {
  switch (verdict) {
    case 'identical': return { color: '#3fb950', bg: 'rgba(63,185,80,0.08)',   border: '#3fb95033', label: 'Identical' };
    case 'similar':   return { color: '#3fb950', bg: 'rgba(63,185,80,0.06)',   border: '#3fb95022', label: 'Very Similar' };
    case 'related':   return { color: '#d29922', bg: 'rgba(210,153,34,0.08)', border: '#d2992233', label: 'Related' };
    default:          return { color: '#f85149', bg: 'rgba(248,81,73,0.08)',   border: '#f8514933', label: 'Different' };
  }
}

function elaColor(score: number) {
  if (score > 0.15) return '#f85149';
  if (score > 0.05) return '#d29922';
  return '#3fb950';
}

function assessmentColor(verdict: string) {
  if (verdict === 'edited')    return '#f85149';
  if (verdict === 'uncertain') return '#d29922';
  return '#3fb950';
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Drop zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  label:    string;
  file:     File | null;
  preview:  string | null;
  error:    string | null;
  disabled: boolean;
  onFile:   (f: File) => void;
  onClear:  () => void;
  inputId:  string;
}

function DropZone({ label, file, preview, error, disabled, onFile, onClear, inputId }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  function validate(f: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type as typeof ACCEPTED_IMAGE_TYPES[number]))
      return 'Unsupported format. Use JPEG, PNG, WebP or GIF.';
    if (f.size > MAX_UPLOAD_SIZE_BYTES)
      return `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`;
    return null;
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) {
      const err = validate(f);
      if (!err) onFile(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>{label}</p>

      <AnimatePresence mode="wait">
        {!preview ? (
          <motion.label
            key="zone"
            htmlFor={inputId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all duration-200',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            style={{
              borderColor: dragging ? '#1E8449' : '#30363d',
              background:  dragging ? 'rgba(30,132,73,0.05)' : '#0d1117',
              minHeight: 220,
            }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: dragging ? 'rgba(30,132,73,0.15)' : '#161b27', border: '1px solid #30363d' }}
            >
              <UploadCloud size={20} style={{ color: dragging ? '#3fb950' : '#484f58' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>
                {dragging ? 'Drop to upload' : 'Drop image here'}
              </p>
              <p className="text-xs" style={{ color: '#484f58' }}>
                or <span style={{ color: '#3fb950' }}>click to browse</span>
              </p>
            </div>
            <input
              id={inputId}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { const err = validate(f); if (!err) onFile(f); } }}
              disabled={disabled}
            />
          </motion.label>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-xl"
            style={{ border: '1px solid #30363d', background: '#0d1117' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={label}
              className="w-full object-contain"
              style={{ height: 220 }}
            />
            <button
              onClick={onClear}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full hover:opacity-80 transition-opacity"
              style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid #30363d', color: '#8b949e' }}
            >
              <X size={12} />
            </button>
            <div
              className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
              style={{ background: 'rgba(13,17,23,0.85)' }}
            >
              <FileImage size={11} style={{ color: '#3fb950' }} />
              <span className="truncate text-xs" style={{ color: '#e6edf3' }}>{file?.name}</span>
              <span className="ml-auto shrink-0 text-xs" style={{ color: '#484f58' }}>
                {file ? fileSize(file.size) : ''}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-xs"
          style={{ color: '#f85149' }}
        >
          <AlertCircle size={11} />
          {error}
        </motion.p>
      )}
    </div>
  );
}

// ─── Metric pill ───────────────────────────────────────────────────────────────

function MetricPill({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl px-4 py-3"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      <span style={{ color: '#484f58' }}>{icon}</span>
      <span className="text-lg font-bold font-mono" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: '#484f58' }}>{label}</span>
    </div>
  );
}

// ─── Image result card ─────────────────────────────────────────────────────────

function ImageResultCard({ img, label }: { img: ImagePayload; label: string }) {
  const elaCol   = elaColor(img.ela.score);
  const asmtCol  = assessmentColor(img.assessment.verdict);
  const asmtLabel = img.assessment.verdict === 'edited' ? 'Likely Edited'
    : img.assessment.verdict === 'uncertain' ? 'Uncertain'
    : 'Likely Original';

  return (
    <div
      className="flex flex-col gap-4 rounded-xl p-4"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>{label}</p>

      {/* Main image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.cloudinaryUrl}
        alt={label}
        className="w-full rounded-lg object-contain"
        style={{ height: 200, background: '#0d1117', border: '1px solid #21262d' }}
        onError={(e) => { (e.target as HTMLImageElement).style.background = '#0d1117'; }}
      />

      {/* ELA heatmap */}
      <div>
        <p className="mb-1.5 text-xs" style={{ color: '#484f58' }}>ELA Analysis</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.cloudinaryUrl}
              alt="Original"
              className="w-full rounded-md object-cover"
              style={{ height: 100, background: '#0d1117' }}
            />
            <p className="text-center text-xs" style={{ color: '#30363d' }}>Original</p>
          </div>
          <div className="space-y-1">
            {img.ela.heatmapUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.ela.heatmapUrl}
                alt="ELA"
                className="w-full rounded-md object-cover"
                style={{ height: 100, background: '#0d1117', border: `1px solid ${img.ela.isLikelyEdited ? '#f8514933' : '#30363d'}` }}
              />
            ) : (
              <div
                className="flex w-full items-center justify-center rounded-md text-xs"
                style={{ height: 100, background: '#0d1117', border: '1px solid #30363d', color: '#484f58' }}
              >
                Unavailable
              </div>
            )}
            <p className="text-center text-xs" style={{ color: '#30363d' }}>ELA</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* ELA score */}
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: '#1c2333', border: '1px solid #30363d' }}
        >
          <p className="text-xs" style={{ color: '#484f58' }}>ELA Score</p>
          <p className="text-xl font-bold font-mono mt-0.5" style={{ color: elaCol }}>
            {img.ela.score.toFixed(3)}
          </p>
        </div>

        {/* Edit assessment */}
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: '#1c2333', border: '1px solid #30363d' }}
        >
          <p className="text-xs" style={{ color: '#484f58' }}>Edit Prob.</p>
          <p className="text-xl font-bold font-mono mt-0.5" style={{ color: asmtCol }}>
            {Math.round(img.assessment.editProbability * 100)}%
          </p>
        </div>
      </div>

      {/* Verdict badge */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          background: img.assessment.verdict === 'edited' ? 'rgba(248,81,73,0.08)' : img.assessment.verdict === 'uncertain' ? 'rgba(210,153,34,0.08)' : 'rgba(63,185,80,0.08)',
          border: `1px solid ${asmtCol}33`,
        }}
      >
        {img.assessment.verdict === 'edited' ? <ShieldAlert size={13} style={{ color: asmtCol }} />
          : img.assessment.verdict === 'uncertain' ? <AlertTriangle size={13} style={{ color: asmtCol }} />
          : <ShieldCheck size={13} style={{ color: asmtCol }} />}
        <span className="text-xs font-semibold" style={{ color: asmtCol }}>{asmtLabel}</span>
        <span className="ml-auto text-xs font-mono" style={{ color: '#484f58' }}>
          {img.metadata.format?.toUpperCase() ?? '—'} · {img.metadata.width}×{img.metadata.height}
        </span>
      </div>

      {/* EXIF summary */}
      {(img.metadata.camera || img.metadata.software) && (
        <div className="space-y-1">
          {img.metadata.camera && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: '#484f58' }}>Camera</span>
              <span style={{ color: '#8b949e' }}>{img.metadata.camera}</span>
            </div>
          )}
          {img.metadata.software && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: '#484f58' }}>Software</span>
              <span style={{ color: '#d29922' }}>{img.metadata.software}</span>
            </div>
          )}
          {img.metadata.dateCreated && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: '#484f58' }}>Date</span>
              <span style={{ color: '#8b949e' }}>{img.metadata.dateCreated}</span>
            </div>
          )}
        </div>
      )}

      {/* Hashes */}
      <div className="space-y-1.5">
        {[
          { label: 'pHash',   value: img.pHash.slice(0, 20) + '…' },
          { label: 'SHA-256', value: img.cryptoHash.slice(0, 20) + '…' },
        ].map(({ label: lbl, value }) => (
          <div key={lbl} className="flex items-center justify-between text-xs">
            <span style={{ color: '#484f58' }}>{lbl}</span>
            <span className="font-mono" style={{ color: '#484f58' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [fileA,    setFileA]    = useState<File | null>(null);
  const [fileB,    setFileB]    = useState<File | null>(null);
  const [previewA, setPreviewA] = useState<string | null>(null);
  const [previewB, setPreviewB] = useState<string | null>(null);
  const [errorA,   setErrorA]   = useState<string | null>(null);
  const [errorB,   setErrorB]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<CompareResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function clearA() {
    if (previewA) URL.revokeObjectURL(previewA);
    setFileA(null); setPreviewA(null); setErrorA(null); setResult(null);
  }
  function clearB() {
    if (previewB) URL.revokeObjectURL(previewB);
    setFileB(null); setPreviewB(null); setErrorB(null); setResult(null);
  }

  function handleFileA(f: File) {
    setFileA(f);
    setPreviewA(URL.createObjectURL(f));
    setResult(null);
  }
  function handleFileB(f: File) {
    setFileB(f);
    setPreviewB(URL.createObjectURL(f));
    setResult(null);
  }

  async function handleCompare() {
    if (!fileA || !fileB) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append('imageA', fileA);
    fd.append('imageB', fileB);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res  = await fetch('/api/images/compare', { method: 'POST', body: fd, signal: ac.signal });
      const data = await res.json() as CompareResult & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Comparison failed.'); return; }
      setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canCompare = !!fileA && !!fileB && !loading;
  const vs         = result ? verdictStyle(result.comparison.verdict) : null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-5 lg:p-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
            >
              <GitCompareArrows size={18} style={{ color: '#3fb950' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#e6edf3' }}>Image Comparator</h1>
              <p className="text-xs" style={{ color: '#8b949e' }}>
                Compare two images — pHash · CLIP similarity · ELA forensics · Edit detection
              </p>
            </div>
          </div>
        </div>

        {/* ── Upload zone ───────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5"
          style={{ background: '#161b27', border: '1px solid #30363d' }}
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <DropZone
              label="Image A"
              file={fileA}
              preview={previewA}
              error={errorA}
              disabled={loading}
              onFile={handleFileA}
              onClear={clearA}
              inputId="upload-a"
            />

            {/* VS divider */}
            <div className="flex items-center justify-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: '#0d1117', border: '2px solid #30363d', color: '#484f58' }}
              >
                VS
              </div>
            </div>

            <DropZone
              label="Image B"
              file={fileB}
              preview={previewB}
              error={errorB}
              disabled={loading}
              onFile={handleFileB}
              onClear={clearB}
              inputId="upload-b"
            />
          </div>

          {/* Compare button */}
          <div className="mt-5 flex justify-center">
            <button
              onClick={handleCompare}
              disabled={!canCompare}
              className={cn(
                'flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150',
                canCompare ? 'hover:brightness-110 active:scale-[0.98]' : 'cursor-not-allowed opacity-40'
              )}
              style={{
                background: canCompare ? 'linear-gradient(135deg, #1E8449, #27ae60)' : '#21262d',
                color:   '#fff',
                border:  '1px solid rgba(30,132,73,0.4)',
              }}
            >
              {loading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="h-4 w-4 rounded-full"
                    style={{ border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff' }}
                  />
                  Analyzing both images…
                </>
              ) : (
                <>
                  <GitCompareArrows size={15} />
                  Compare Images
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center justify-center gap-1.5 text-sm"
              style={{ color: '#f85149' }}
            >
              <AlertCircle size={14} />
              {error}
            </motion.p>
          )}
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* ── Verdict banner ────────────────────────────────────────── */}
              <motion.div
                initial={{ scale: 0.97 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl px-6 py-5"
                style={{ background: vs!.bg, border: `2px solid ${vs!.border}` }}
              >
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: `${vs!.color}22`, border: `1px solid ${vs!.color}44` }}
                  >
                    <CheckCircle2 size={28} style={{ color: vs!.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-bold" style={{ color: vs!.color }}>{vs!.label}</p>
                    <p className="mt-0.5 text-sm" style={{ color: '#8b949e' }}>{result.comparison.description}</p>
                  </div>
                  <div
                    className="shrink-0 rounded-xl px-4 py-2 text-center"
                    style={{ background: `${vs!.color}15`, border: `1px solid ${vs!.color}33` }}
                  >
                    <p className="text-2xl font-bold font-mono" style={{ color: vs!.color }}>
                      {Math.round(result.comparison.confidence * 100)}%
                    </p>
                    <p className="text-xs" style={{ color: '#484f58' }}>confidence</p>
                  </div>
                </div>
              </motion.div>

              {/* ── Metrics row ────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricPill
                  icon={<ScanLine size={14} />}
                  label="pHash Distance"
                  value={String(result.comparison.pHashDistance)}
                  color={
                    result.comparison.pHashDistance <= 10 ? '#3fb950'
                    : result.comparison.pHashDistance <= 20 ? '#d29922'
                    : '#f85149'
                  }
                />
                <MetricPill
                  icon={<Cpu size={14} />}
                  label="CLIP Similarity"
                  value={
                    result.comparison.clipSimilarity !== null
                      ? `${(result.comparison.clipSimilarity * 100).toFixed(1)}%`
                      : 'N/A'
                  }
                  color={
                    result.comparison.clipSimilarity === null ? '#484f58'
                    : result.comparison.clipSimilarity >= 0.80 ? '#3fb950'
                    : result.comparison.clipSimilarity >= 0.60 ? '#d29922'
                    : '#f85149'
                  }
                />
                <MetricPill
                  icon={<ScanLine size={14} />}
                  label="ELA A"
                  value={result.imageA.ela.score.toFixed(3)}
                  color={elaColor(result.imageA.ela.score)}
                />
                <MetricPill
                  icon={<ScanLine size={14} />}
                  label="ELA B"
                  value={result.imageB.ela.score.toFixed(3)}
                  color={elaColor(result.imageB.ela.score)}
                />
              </div>

              {/* Crypto hash match badge */}
              {result.comparison.cryptoHashMatch && (
                <div
                  className="flex items-center gap-2 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.3)' }}
                >
                  <CheckCircle2 size={15} style={{ color: '#3fb950' }} />
                  <p className="text-sm font-medium" style={{ color: '#3fb950' }}>
                    Identical files — SHA-256 hash match. These are byte-for-byte the same image.
                  </p>
                </div>
              )}

              {/* ── Side-by-side image details ─────────────────────────────── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ImageResultCard img={result.imageA} label="Image A" />
                <ImageResultCard img={result.imageB} label="Image B" />
              </div>

              {/* ── Processing time ────────────────────────────────────────── */}
              <p className="text-center text-xs" style={{ color: '#30363d' }}>
                Analyzed in {(result.processingTime / 1000).toFixed(1)}s
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state hint */}
        {!result && !loading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: '#161b27', border: '1px solid #30363d' }}
            >
              <GitCompareArrows size={28} style={{ color: '#484f58' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#484f58' }}>
              Upload both images above to compare them
            </p>
            <p className="text-xs max-w-xs" style={{ color: '#30363d' }}>
              The comparison uses pHash distance, CLIP semantic similarity, and ELA forensics to determine how related two images are.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
