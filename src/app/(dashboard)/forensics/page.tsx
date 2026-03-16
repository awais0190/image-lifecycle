'use client';

/**
 * /forensics — Standalone ELA Forensics Tool
 * Upload a single image → get full forensic analysis:
 * ELA heatmap, EXIF metadata, edit assessment, fingerprints.
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence }       from 'framer-motion';
import {
  UploadCloud, X, AlertCircle, FileImage, ScanLine,
  ShieldCheck, ShieldAlert, AlertTriangle, Microscope,
  Hash, Calendar, Camera, Monitor, MapPin, Info, ChevronDown, ChevronUp, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MAX_UPLOAD_SIZE_BYTES, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/constants';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ForensicsResult {
  status:         'success';
  filename:       string;
  processingTime: number;
  image: {
    cloudinaryUrl:       string;
    cloudinaryPublicId:  string;
    pHash:               string;
    cryptoHash:          string;
    clipEmbedding:       number[] | null;
    clipAvailable:       boolean;
  };
  metadata: {
    width:       number;
    height:      number;
    format:      string;
    fileSize:    number;
    dateCreated: string | null;
    camera:      string | null;
    software:    string | null;
    gps:         { latitude: number; longitude: number } | null;
  };
  ela: {
    score:           number;
    heatmapUrl:      string | null;
    isLikelyEdited:  boolean;
    highDiffRegions: number;
    analysisTime:    number;
  };
  assessment: {
    verdict:           'original' | 'edited' | 'uncertain';
    editProbability:   number;
    overallConfidence: number;
    signals: {
      exif: { score: number; weight: number; reason: string };
      ela:  { score: number; weight: number; reason: string };
      clip: { score: number; weight: number; reason: string } | null;
    };
  };
  face: { faceDetected: boolean; faceCount: number; confidence: number } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function elaColor(score: number) {
  if (score > 0.15) return '#f85149';
  if (score > 0.05) return '#d29922';
  return '#3fb950';
}

function verdictColor(verdict: string) {
  if (verdict === 'edited')    return '#f85149';
  if (verdict === 'uncertain') return '#d29922';
  return '#3fb950';
}

function verdictLabel(verdict: string) {
  if (verdict === 'edited')    return 'Likely Edited';
  if (verdict === 'uncertain') return 'Uncertain';
  return 'Likely Original';
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatGps(gps: { latitude: number; longitude: number }) {
  const lat = Math.abs(gps.latitude).toFixed(4) + '° ' + (gps.latitude >= 0 ? 'N' : 'S');
  const lng = Math.abs(gps.longitude).toFixed(4) + '° ' + (gps.longitude >= 0 ? 'E' : 'W');
  return `${lat}, ${lng}`;
}

function scoreBar(score: number, color: string) {
  const pct = Math.min(100, Math.round(score * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 overflow-hidden rounded-full"
        style={{ height: 6, background: '#21262d' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="w-10 text-right text-xs font-mono" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ─── Info tooltip ───────────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="ml-1 align-middle opacity-50 hover:opacity-100 transition-opacity"
      >
        <Info size={11} style={{ color: '#8b949e' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 z-50 mb-1.5 w-48 -translate-x-1/2 rounded-lg px-3 py-2 text-xs"
            style={{ background: '#1c2333', border: '1px solid #30363d', color: '#8b949e', pointerEvents: 'none' }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Section card ───────────────────────────────────────────────────────────────

function Section({
  title, icon, children, collapsible = false, defaultOpen = true,
}: {
  title: React.ReactNode; icon: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      <button
        className={cn(
          'flex w-full items-center justify-between gap-3 px-5 py-4 text-left',
          collapsible ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default',
          'transition-colors duration-150'
        )}
        onClick={() => collapsible && setOpen(!open)}
        disabled={!collapsible}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ color: '#3fb950' }}>{icon}</span>
          <span className="text-sm font-semibold" style={{ color: '#e6edf3' }}>{title}</span>
        </div>
        {collapsible && (
          <span style={{ color: '#484f58' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-5 pb-5 pt-1"
              style={{ borderTop: '1px solid #21262d' }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Metadata row ───────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: '1px solid #21262d' }}>
      <span className="shrink-0 text-xs" style={{ color: '#484f58' }}>{label}</span>
      <span className={cn('text-right text-xs break-all', mono ? 'font-mono' : '')} style={{ color: '#8b949e' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Signal row ─────────────────────────────────────────────────────────────────

function SignalRow({
  label, tip, score, weight, reason,
}: { label: string; tip: string; score: number; weight: number; reason: string }) {
  const col = score > 0.6 ? '#f85149' : score > 0.3 ? '#d29922' : '#3fb950';
  return (
    <div className="space-y-1.5 py-3" style={{ borderBottom: '1px solid #21262d' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: '#e6edf3' }}>
          {label}
          <Tip text={tip} />
        </span>
        <span className="text-xs" style={{ color: '#484f58' }}>
          weight {Math.round(weight * 100)}%
        </span>
      </div>
      {scoreBar(score, col)}
      <p className="text-xs" style={{ color: '#484f58' }}>{reason}</p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ForensicsPage() {
  const [file,     setFile]     = useState<File | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [fileErr,  setFileErr]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<ForensicsResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function validateFile(f: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type as typeof ACCEPTED_IMAGE_TYPES[number]))
      return 'Unsupported format. Use JPEG, PNG, WebP or GIF.';
    if (f.size > MAX_UPLOAD_SIZE_BYTES)
      return `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`;
    return null;
  }

  function acceptFile(f: File) {
    const err = validateFile(f);
    if (err) { setFileErr(err); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setFileErr(null);
    setResult(null);
    setError(null);
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setFileErr(null); setResult(null); setError(null);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append('image', file);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res  = await fetch('/api/images/forensics', { method: 'POST', body: fd, signal: ac.signal });
      const data = await res.json() as ForensicsResult & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Forensic analysis failed.'); return; }
      setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setLoading(false);
  }

  const asmtColor = result ? verdictColor(result.assessment.verdict) : '#484f58';
  const isPng     = result?.metadata.format?.toLowerCase() === 'png';

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-5 lg:p-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
            >
              <Microscope size={18} style={{ color: '#3fb950' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#e6edf3' }}>Image Forensics</h1>
              <p className="text-xs" style={{ color: '#8b949e' }}>
                Deep-dive analysis: ELA · EXIF · Edit detection · Fingerprints — no cloud storage required
              </p>
            </div>
          </div>
        </div>

        {/* ── Upload zone ───────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5"
          style={{ background: '#161b27', border: '1px solid #30363d' }}
        >
          <AnimatePresence mode="wait">
            {!preview ? (
              <motion.label
                key="dropzone"
                htmlFor="forensics-upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 transition-all duration-200',
                  loading && 'cursor-not-allowed opacity-50'
                )}
                style={{
                  borderColor: dragging ? '#1E8449' : '#30363d',
                  background:  dragging ? 'rgba(30,132,73,0.05)' : '#0d1117',
                  minHeight: 200,
                }}
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-xl"
                  style={{ background: dragging ? 'rgba(30,132,73,0.15)' : '#161b27', border: '1px solid #30363d' }}
                >
                  <UploadCloud size={24} style={{ color: dragging ? '#3fb950' : '#484f58' }} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>
                    {dragging ? 'Drop to analyze' : 'Drop an image here'}
                  </p>
                  <p className="text-xs" style={{ color: '#484f58' }}>
                    or <span style={{ color: '#3fb950' }}>click to browse</span>
                  </p>
                  <p className="text-xs" style={{ color: '#30363d' }}>JPEG · PNG · WebP · GIF — max 10 MB</p>
                </div>
                <input
                  id="forensics-upload"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
                  disabled={loading}
                />
              </motion.label>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Preview strip */}
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{ border: '1px solid #30363d', background: '#0d1117' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="preview"
                    className="w-full object-contain"
                    style={{ maxHeight: 300 }}
                  />
                  <button
                    onClick={clearFile}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                    style={{ background: 'rgba(13,17,23,0.85)', border: '1px solid #30363d', color: '#8b949e' }}
                  >
                    <X size={13} />
                  </button>
                  <div
                    className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
                    style={{ background: 'rgba(13,17,23,0.85)' }}
                  >
                    <FileImage size={12} style={{ color: '#3fb950' }} />
                    <span className="truncate text-xs" style={{ color: '#e6edf3' }}>{file?.name}</span>
                    <span className="ml-auto shrink-0 text-xs" style={{ color: '#484f58' }}>
                      {file ? fileSize(file.size) : ''}
                    </span>
                  </div>
                </div>

                {/* Analyze button */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150',
                      !loading ? 'hover:brightness-110 active:scale-[0.98]' : 'cursor-wait opacity-80'
                    )}
                    style={{
                      background: 'linear-gradient(135deg, #1E8449, #27ae60)',
                      color: '#fff',
                      border: '1px solid rgba(30,132,73,0.4)',
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
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <Microscope size={15} />
                        Run Forensic Analysis
                      </>
                    )}
                  </button>
                  {loading && (
                    <button
                      onClick={handleCancel}
                      className="rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 hover:bg-white/5"
                      style={{ color: '#8b949e', border: '1px solid #30363d' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* File error */}
          {fileErr && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center gap-1.5 text-xs"
              style={{ color: '#f85149' }}
            >
              <AlertCircle size={11} />
              {fileErr}
            </motion.p>
          )}

          {/* Request error */}
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
              className="space-y-4"
            >

              {/* ── Verdict banner ─────────────────────────────────────────── */}
              <motion.div
                initial={{ scale: 0.97 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl px-6 py-5"
                style={{
                  background: `${asmtColor}0d`,
                  border: `2px solid ${asmtColor}33`,
                }}
              >
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: `${asmtColor}1a`, border: `1px solid ${asmtColor}44` }}
                  >
                    {result.assessment.verdict === 'edited'    ? <ShieldAlert  size={28} style={{ color: asmtColor }} />
                    : result.assessment.verdict === 'uncertain' ? <AlertTriangle size={28} style={{ color: asmtColor }} />
                    :                                             <ShieldCheck  size={28} style={{ color: asmtColor }} />}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-xl font-bold" style={{ color: asmtColor }}>
                      {verdictLabel(result.assessment.verdict)}
                    </p>
                    <p className="mt-0.5 text-sm" style={{ color: '#8b949e' }}>
                      {result.metadata.format?.toUpperCase() ?? '?'} · {result.metadata.width}×{result.metadata.height} ·{' '}
                      {fileSize(result.metadata.fileSize)}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div
                      className="rounded-xl px-4 py-2 text-center"
                      style={{ background: `${asmtColor}15`, border: `1px solid ${asmtColor}33` }}
                    >
                      <p className="text-2xl font-bold font-mono" style={{ color: asmtColor }}>
                        {Math.round(result.assessment.editProbability * 100)}%
                      </p>
                      <p className="text-xs" style={{ color: '#484f58' }}>edit prob.</p>
                    </div>
                    <div
                      className="rounded-xl px-4 py-2 text-center"
                      style={{ background: '#1c2333', border: '1px solid #30363d' }}
                    >
                      <p className="text-2xl font-bold font-mono" style={{ color: '#e6edf3' }}>
                        {Math.round(result.assessment.overallConfidence * 100)}%
                      </p>
                      <p className="text-xs" style={{ color: '#484f58' }}>confidence</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* ── Two-column layout: ELA + details ─────────────────────── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                {/* ELA section */}
                <Section
                  title={
                    <span className="flex items-center gap-2">
                      ELA Analysis
                      {isPng && (
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-semibold"
                          style={{ background: 'rgba(210,153,34,0.15)', color: '#d29922', border: '1px solid #d2992233' }}
                        >
                          PNG
                        </span>
                      )}
                    </span>
                  }
                  icon={<ScanLine size={15} />}
                >
                  <div className="space-y-4 pt-2">
                    {isPng && (
                      <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(210,153,34,0.08)', color: '#d29922', border: '1px solid #d2992233' }}>
                        PNG images use lossless compression. ELA is most reliable on JPEG. Results may show elevated scores even for unedited PNGs.
                      </p>
                    )}

                    {/* Heatmap side-by-side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.image.cloudinaryUrl}
                          alt="Original"
                          className="w-full rounded-lg object-contain"
                          style={{ height: 150, background: '#0d1117', border: '1px solid #21262d' }}
                        />
                        <p className="text-center text-xs" style={{ color: '#30363d' }}>Original</p>
                      </div>
                      <div className="space-y-1">
                        {result.ela.heatmapUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.ela.heatmapUrl}
                            alt="ELA Heatmap"
                            className="w-full rounded-lg object-contain"
                            style={{
                              height: 150,
                              background: '#0d1117',
                              border: `1px solid ${result.ela.isLikelyEdited ? '#f8514933' : '#21262d'}`,
                            }}
                          />
                        ) : (
                          <div
                            className="flex w-full items-center justify-center rounded-lg text-xs"
                            style={{ height: 150, background: '#0d1117', border: '1px solid #30363d', color: '#484f58' }}
                          >
                            Unavailable
                          </div>
                        )}
                        <p className="text-center text-xs" style={{ color: '#30363d' }}>ELA</p>
                      </div>
                    </div>

                    {/* ELA stats */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'ELA Score', value: result.ela.score.toFixed(4), color: elaColor(result.ela.score) },
                        { label: 'High Diff', value: String(result.ela.highDiffRegions), color: result.ela.highDiffRegions > 5 ? '#f85149' : '#8b949e' },
                        { label: 'Analysis', value: `${result.ela.analysisTime}ms`, color: '#484f58' },
                      ].map(({ label, value, color }) => (
                        <div
                          key={label}
                          className="rounded-lg px-2 py-2 text-center"
                          style={{ background: '#1c2333', border: '1px solid #30363d' }}
                        >
                          <p className="text-xs mb-0.5" style={{ color: '#484f58' }}>{label}</p>
                          <p className="font-bold font-mono text-sm" style={{ color }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* Metadata section */}
                <Section title="EXIF Metadata" icon={<Camera size={15} />} collapsible defaultOpen>
                  <div className="pt-1">
                    <MetaRow label="Dimensions"   value={`${result.metadata.width} × ${result.metadata.height} px`} />
                    <MetaRow label="Format"       value={result.metadata.format?.toUpperCase() ?? '—'} />
                    <MetaRow label="File Size"    value={fileSize(result.metadata.fileSize)} />
                    <MetaRow
                      label="Date Created"
                      value={result.metadata.dateCreated
                        ? <span className="flex items-center gap-1"><Calendar size={10} />{result.metadata.dateCreated}</span>
                        : <span style={{ color: '#30363d' }}>Not available</span>
                      }
                    />
                    <MetaRow
                      label="Camera"
                      value={result.metadata.camera
                        ? <span className="flex items-center gap-1"><Camera size={10} />{result.metadata.camera}</span>
                        : <span style={{ color: '#30363d' }}>Not available</span>
                      }
                    />
                    <MetaRow
                      label="Software"
                      value={result.metadata.software
                        ? <span className="flex items-center gap-1" style={{ color: '#d29922' }}>
                            <Monitor size={10} />{result.metadata.software}
                          </span>
                        : <span style={{ color: '#30363d' }}>Not available</span>
                      }
                    />
                    {result.metadata.gps && (
                      <MetaRow
                        label="GPS"
                        value={
                          <a
                            href={`https://www.google.com/maps?q=${result.metadata.gps.latitude},${result.metadata.gps.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                            style={{ color: '#58a6ff' }}
                          >
                            <MapPin size={10} />
                            {formatGps(result.metadata.gps)}
                          </a>
                        }
                      />
                    )}
                  </div>
                </Section>
              </div>

              {/* ── Signals section ────────────────────────────────────────── */}
              <Section title="Edit Detection Signals" icon={<Microscope size={15} />} collapsible defaultOpen>
                <div className="pt-1">
                  <SignalRow
                    label="EXIF Signal"
                    tip="Analyzes metadata inconsistencies — software tags, missing fields, suspicious timestamps."
                    score={result.assessment.signals.exif.score}
                    weight={result.assessment.signals.exif.weight}
                    reason={result.assessment.signals.exif.reason}
                  />
                  <SignalRow
                    label="ELA Signal"
                    tip="Error Level Analysis detects regions with inconsistent compression artifacts, which can indicate local edits."
                    score={result.assessment.signals.ela.score}
                    weight={result.assessment.signals.ela.weight}
                    reason={result.assessment.signals.ela.reason}
                  />
                  {result.assessment.signals.clip && (
                    <SignalRow
                      label="CLIP Signal"
                      tip="Semantic similarity via a neural embedding model. Compares to known-original versions."
                      score={result.assessment.signals.clip.score}
                      weight={result.assessment.signals.clip.weight}
                      reason={result.assessment.signals.clip.reason}
                    />
                  )}
                </div>
              </Section>

              {/* ── Face Detection section ─────────────────────────────────── */}
              {result.face && (
                <Section title="Face Detection" icon={<UserCheck size={15} />} collapsible defaultOpen>
                  <div className="pt-2">
                    <div
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{
                        background: result.face.faceDetected ? 'rgba(88,166,255,0.08)' : '#1c2333',
                        border:     result.face.faceDetected ? '1px solid rgba(88,166,255,0.3)' : '1px solid #30363d',
                      }}
                    >
                      <UserCheck size={22} style={{ color: result.face.faceDetected ? '#58a6ff' : '#484f58' }} />
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: result.face.faceDetected ? '#58a6ff' : '#484f58' }}>
                          {result.face.faceDetected
                            ? `${result.face.faceCount} face${result.face.faceCount !== 1 ? 's' : ''} detected`
                            : 'No face detected'}
                        </p>
                        {result.face.faceDetected && (
                          <p className="text-xs mt-0.5" style={{ color: '#8b949e' }}>
                            Detection confidence: {Math.round(result.face.confidence * 100)}%
                          </p>
                        )}
                      </div>
                      {result.face.faceDetected && (
                        <div
                          className="rounded-xl px-3 py-1.5 text-center"
                          style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)' }}
                        >
                          <p className="text-xl font-bold font-mono" style={{ color: '#58a6ff' }}>
                            {Math.round(result.face.confidence * 100)}%
                          </p>
                          <p className="text-xs" style={{ color: '#484f58' }}>confidence</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* ── Fingerprints section ───────────────────────────────────── */}
              <Section title="Image Fingerprints" icon={<Hash size={15} />} collapsible defaultOpen={false}>
                <div className="space-y-3 pt-2">
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium" style={{ color: '#8b949e' }}>
                      pHash
                      <Tip text="Perceptual hash — captures visual fingerprint. Similar images have low Hamming distance." />
                    </p>
                    <code
                      className="block w-full break-all rounded-lg px-3 py-2 text-xs"
                      style={{ background: '#0d1117', border: '1px solid #21262d', color: '#3fb950', fontFamily: 'monospace' }}
                    >
                      {result.image.pHash}
                    </code>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium" style={{ color: '#8b949e' }}>
                      SHA-256
                      <Tip text="Cryptographic hash. Two files with the same SHA-256 are byte-for-byte identical." />
                    </p>
                    <code
                      className="block w-full break-all rounded-lg px-3 py-2 text-xs"
                      style={{ background: '#0d1117', border: '1px solid #21262d', color: '#8b949e', fontFamily: 'monospace' }}
                    >
                      {result.image.cryptoHash}
                    </code>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium" style={{ color: '#8b949e' }}>
                      CLIP Embedding
                      <Tip text="Neural semantic vector. Used for semantic similarity comparison across images." />
                    </p>
                    <div
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{ background: '#0d1117', border: '1px solid #21262d' }}
                    >
                      {result.image.clipAvailable && result.image.clipEmbedding
                        ? <span style={{ color: '#3fb950' }}>
                            {result.image.clipEmbedding.length}-dimensional vector available
                          </span>
                        : <span style={{ color: '#484f58' }}>Not available (CLIP service offline)</span>
                      }
                    </div>
                  </div>
                  {result.image.cloudinaryPublicId && (
                    <MetaRow label="Cloudinary ID" value={result.image.cloudinaryPublicId} mono />
                  )}
                </div>
              </Section>

              {/* Processing time */}
              <p className="text-center text-xs" style={{ color: '#30363d' }}>
                Analyzed in {(result.processingTime / 1000).toFixed(1)}s ·{' '}
                {result.filename !== 'image' ? result.filename : 'uploaded image'}
              </p>

            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!result && !loading && !preview && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: '#161b27', border: '1px solid #30363d' }}
            >
              <Microscope size={32} style={{ color: '#484f58' }} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium" style={{ color: '#484f58' }}>
                Upload an image to run forensic analysis
              </p>
              <p className="text-xs max-w-sm" style={{ color: '#30363d' }}>
                Analyzes ELA compression artifacts, EXIF metadata, and edit probability — entirely in your browser, no tracking.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {['ELA Heatmap', 'EXIF Metadata', 'Edit Probability', 'pHash + SHA-256', 'CLIP Embedding'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ background: '#161b27', border: '1px solid #30363d', color: '#484f58' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
