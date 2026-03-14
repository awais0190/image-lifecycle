'use client';

/**
 * /batch — Multi-Image Relationship Analyzer
 * Upload 2–10 images → system fingerprints each, computes pairwise similarity,
 * determines which is the original, builds a parent/child provenance tree.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence }                  from 'framer-motion';
import {
  ReactFlow, Background, Controls, BackgroundVariant,
  Handle, Position,
  type Node as RFNode, type Edge as RFEdge,
  ReactFlowProvider, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Layers, UploadCloud, X, AlertCircle, ScanLine,
  ShieldCheck, ShieldAlert, AlertTriangle, Crown,
  ChevronDown, ChevronUp, GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MAX_UPLOAD_SIZE_BYTES, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/constants';
import type { BatchNode, BatchEdge } from '@/app/api/images/batch/route';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BatchResult {
  status:         'success';
  processingTime: number;
  rootId:         string;
  nodes:          Omit<BatchNode, 'clipEmbedding'>[];
  edges:          BatchEdge[];
  matrix:         Array<{ a: string; b: string; pHashDistance: number; clipSimilarity: number | null }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function verdictColor(v: string) {
  if (v === 'edited')    return '#f85149';
  if (v === 'uncertain') return '#d29922';
  return '#3fb950';
}
function verdictIcon(v: string, size = 12) {
  if (v === 'edited')    return <ShieldAlert  size={size} style={{ color: '#f85149' }} />;
  if (v === 'uncertain') return <AlertTriangle size={size} style={{ color: '#d29922' }} />;
  return <ShieldCheck size={size} style={{ color: '#3fb950' }} />;
}
function elaColor(s: number) {
  if (s > 0.15) return '#f85149';
  if (s > 0.05) return '#d29922';
  return '#3fb950';
}
function fileSize(b: number) {
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}
// Mirror of server-side combinedSimilarity — CLIP is 90% when available
function clientRelType(dist: number, clipSim: number | null): BatchEdge['relationshipType'] {
  if (dist === 0) return 'identical';
  const pHashSim = 1 - dist / 64;
  const score = clipSim !== null ? clipSim * 0.90 + pHashSim * 0.10 : pHashSim;
  if (score >= 0.88) return 'near-duplicate';
  if (score >= 0.72) return 'similar';
  if (score >= 0.50) return 'related';
  return 'different';
}

function relColor(type: BatchEdge['relationshipType']) {
  switch (type) {
    case 'identical':      return '#3fb950';
    case 'near-duplicate': return '#3fb950';
    case 'similar':        return '#58a6ff';
    case 'related':        return '#d29922';
    default:               return '#6e7681';  // lighter grey — visible on dark bg
  }
}

// ─── Dagre layout ──────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 130;

function layoutGraph(nodes: RFNode[], edges: RFEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => ({
      ...n,
      position: { x: g.node(n.id).x - NODE_W / 2, y: g.node(n.id).y - NODE_H / 2 },
    })),
    edges,
  };
}

// ─── Batch tree node (React Flow custom node rendered inline) ─────────────────

function BatchTreeNode({ data }: { data: {
  node: Omit<BatchNode, 'clipEmbedding'>;
  isRoot: boolean;
  selected: boolean;
  onClick: () => void;
}}) {
  const { node, isRoot, selected, onClick } = data;
  const isOutlier = node.isOutlier;
  const col = isOutlier ? '#6e7681' : verdictColor(node.assessment.verdict);

  return (
    <>
      {/* React Flow connection handles — required for edges to render */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: col, border: 'none', width: 8, height: 8 }}
      />

    <div
      onClick={onClick}
      className="cursor-pointer overflow-hidden rounded-xl transition-all duration-150"
      style={{
        width:      NODE_W,
        background: '#161b27',
        border:     `2px solid ${selected ? col : isRoot ? 'rgba(30,132,73,0.6)' : '#30363d'}`,
        boxShadow:  selected ? `0 0 16px ${col}44` : isRoot ? '0 0 12px rgba(30,132,73,0.2)' : 'none',
      }}
    >
      {/* thumbnail */}
      <div className="relative overflow-hidden" style={{ height: 72, background: '#0d1117' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.cloudinaryUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
        />
        {isRoot && (
          <div
            className="absolute left-1 top-1 flex items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ background: 'rgba(30,132,73,0.9)', border: '1px solid #3fb950' }}
          >
            <Crown size={9} style={{ color: '#3fb950' }} />
            <span className="text-[9px] font-bold" style={{ color: '#3fb950' }}>Root</span>
          </div>
        )}
        {isOutlier && (
          <div
            className="absolute left-1 top-1 flex items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ background: 'rgba(248,81,73,0.85)', border: '1px solid #f85149' }}
          >
            <span className="text-[9px] font-bold" style={{ color: '#fff' }}>Outlier</span>
          </div>
        )}
        <div
          className="absolute right-1 top-1 h-2 w-2 rounded-full"
          style={{ background: col, boxShadow: `0 0 4px ${col}` }}
        />
      </div>

      {/* info strip */}
      <div className="px-2.5 py-2 space-y-1">
        <div className="flex items-center justify-between gap-1">
          {verdictIcon(node.assessment.verdict)}
          <span className="truncate text-[10px] font-medium" style={{ color: '#8b949e' }}>
            {node.filename.length > 16 ? node.filename.slice(0, 14) + '…' : node.filename}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span style={{ color: '#484f58' }}>ELA</span>
          <span className="font-mono font-bold" style={{ color: elaColor(node.ela.score) }}>
            {node.ela.score.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span style={{ color: '#484f58' }}>Edit prob.</span>
          <span className="font-mono" style={{ color: col }}>
            {Math.round(node.assessment.editProbability * 100)}%
          </span>
        </div>
      </div>
    </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: col, border: 'none', width: 8, height: 8 }}
      />
    </>
  );
}

const BATCH_NODE_TYPES = { batchNode: BatchTreeNode };

// ─── Inner flow (needs useReactFlow) ──────────────────────────────────────────

function InnerFlow({
  result,
  selectedId,
  onSelect,
}: { result: BatchResult; selectedId: string | null; onSelect: (id: string) => void }) {
  const { fitView } = useReactFlow();

  const { nodes: layoutedNodes, edges: layoutedEdges } = (() => {
    const rfNodes: RFNode[] = result.nodes.map((n) => ({
      id:       n.id,
      type:     'batchNode',
      position: { x: 0, y: 0 },
      data:     { node: n, isRoot: n.id === result.rootId, selected: n.id === selectedId, onClick: () => onSelect(n.id) },
    }));

    const rfEdges: RFEdge[] = result.edges.map((e) => {
      const col      = relColor(e.relationshipType);
      const clipPct  = e.clipSimilarity !== null ? `CLIP ${(e.clipSimilarity * 100).toFixed(0)}%` : null;
      const label    = clipPct
        ? `${clipPct} · Δ${e.pHashDistance}`
        : `Δ${e.pHashDistance}`;
      const animated = e.relationshipType === 'identical' || e.relationshipType === 'near-duplicate';
      return {
        id:             e.id,
        source:         e.parentId,
        target:         e.childId,
        type:           'smoothstep',
        label,
        animated,
        markerEnd:      { type: 'arrowclosed' as const, color: col, width: 16, height: 16 },
        style:          { stroke: col, strokeWidth: 2.5 },
        labelStyle:     { fill: col, fontSize: 9, fontFamily: 'monospace', fontWeight: 600 },
        labelBgStyle:   { fill: '#161b27', fillOpacity: 0.95 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      };
    });

    return layoutGraph(rfNodes, rfEdges);
  })();

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
  }, [result, fitView]);

  return (
    <ReactFlow
      nodes={layoutedNodes}
      edges={layoutedEdges}
      nodeTypes={BATCH_NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background color="#30363d" variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls showInteractive={false} style={{ background: '#161b27', border: '1px solid #30363d' }} />
    </ReactFlow>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  isRoot,
  onClose,
}: { node: Omit<BatchNode, 'clipEmbedding'>; isRoot: boolean; onClose: () => void }) {
  const col = verdictColor(node.assessment.verdict);

  return (
    <motion.div
      key={node.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4 overflow-y-auto rounded-2xl p-4"
      style={{ background: '#161b27', border: '1px solid #30363d', maxHeight: '100%' }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRoot && <Crown size={13} style={{ color: '#3fb950' }} />}
          <span className="text-xs font-semibold truncate max-w-40" style={{ color: '#e6edf3' }}>
            {node.filename}
          </span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-white/5" style={{ color: '#484f58' }}>
          <X size={13} />
        </button>
      </div>

      {/* image */}
      <div className="overflow-hidden rounded-xl" style={{ background: '#0d1117', border: '1px solid #21262d' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.cloudinaryUrl} alt="" className="w-full object-contain" style={{ maxHeight: 180 }} />
      </div>

      {/* verdict */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: `${col}0d`, border: `1px solid ${col}33` }}
      >
        {verdictIcon(node.assessment.verdict, 14)}
        <div>
          <p className="text-xs font-bold capitalize" style={{ color: col }}>{node.assessment.verdict}</p>
          <p className="text-xs" style={{ color: '#484f58' }}>
            {Math.round(node.assessment.editProbability * 100)}% edit probability
          </p>
        </div>
        {isRoot && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: 'rgba(63,185,80,0.12)', color: '#3fb950', border: '1px solid rgba(63,185,80,0.3)' }}
          >
            ROOT
          </span>
        )}
        {node.isOutlier && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)' }}
          >
            OUTLIER
          </span>
        )}
      </div>

      {/* ELA side by side */}
      <div>
        <p className="mb-2 text-xs font-semibold" style={{ color: '#484f58' }}>ELA Analysis</p>
        <div className="grid grid-cols-2 gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={node.cloudinaryUrl} alt="orig" className="w-full rounded-lg object-cover" style={{ height: 80, background: '#0d1117' }} />
          {node.ela.heatmapUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.ela.heatmapUrl} alt="ela"
              className="w-full rounded-lg object-cover"
              style={{ height: 80, background: '#0d1117', border: `1px solid ${node.ela.isLikelyEdited ? '#f8514933' : '#21262d'}` }}
            />
          ) : (
            <div className="flex w-full items-center justify-center rounded-lg text-xs" style={{ height: 80, background: '#0d1117', color: '#484f58' }}>
              N/A
            </div>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: '#1c2333', border: '1px solid #30363d' }}>
            <p className="text-[10px]" style={{ color: '#484f58' }}>ELA Score</p>
            <p className="font-mono text-sm font-bold" style={{ color: elaColor(node.ela.score) }}>{node.ela.score.toFixed(4)}</p>
          </div>
          <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: '#1c2333', border: '1px solid #30363d' }}>
            <p className="text-[10px]" style={{ color: '#484f58' }}>High Diff Regions</p>
            <p className="font-mono text-sm font-bold" style={{ color: node.ela.highDiffRegions > 5 ? '#f85149' : '#8b949e' }}>
              {node.ela.highDiffRegions}
            </p>
          </div>
        </div>
      </div>

      {/* metadata */}
      <div className="space-y-0">
        {[
          { label: 'Dimensions', value: `${node.metadata.width} × ${node.metadata.height}` },
          { label: 'Format',     value: node.metadata.format?.toUpperCase() ?? '—' },
          { label: 'Size',       value: fileSize(node.metadata.fileSize) },
          { label: 'Camera',     value: node.metadata.camera ?? '—' },
          { label: 'Software',   value: node.metadata.software ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: '1px solid #21262d' }}>
            <span style={{ color: '#484f58' }}>{label}</span>
            <span style={{ color: node.metadata.software === value && value !== '—' ? '#d29922' : '#8b949e' }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* hashes */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>Fingerprints</p>
        {[
          { label: 'pHash',   value: node.pHash.slice(0, 24) + '…' },
          { label: 'SHA-256', value: node.cryptoHash.slice(0, 24) + '…' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-[10px]">
            <span style={{ color: '#30363d' }}>{label}</span>
            <span className="font-mono" style={{ color: '#484f58' }}>{value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Similarity matrix ─────────────────────────────────────────────────────────

function SimilarityMatrix({
  nodes, matrix,
}: { nodes: Omit<BatchNode, 'clipEmbedding'>[]; matrix: BatchResult['matrix'] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#161b27', border: '1px solid #30363d' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ScanLine size={14} style={{ color: '#3fb950' }} />
          <span className="text-sm font-semibold" style={{ color: '#e6edf3' }}>Pairwise Similarity Matrix</span>
          <span className="text-xs" style={{ color: '#484f58' }}>
            {matrix.length} pair{matrix.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp size={13} style={{ color: '#484f58' }} /> : <ChevronDown size={13} style={{ color: '#484f58' }} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', borderTop: '1px solid #21262d' }}
          >
            <div className="overflow-x-auto p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="pb-2 pr-4 text-left" style={{ color: '#484f58' }}>Image A</th>
                    <th className="pb-2 pr-4 text-left" style={{ color: '#484f58' }}>Image B</th>
                    <th className="pb-2 pr-4 text-right" style={{ color: '#484f58' }}>pHash Δ</th>
                    <th className="pb-2 pr-4 text-right" style={{ color: '#484f58' }}>CLIP</th>
                    <th className="pb-2 text-center" style={{ color: '#484f58' }}>Relationship</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => {
                    const na = nodes.find((n) => n.id === row.a)!;
                    const nb = nodes.find((n) => n.id === row.b)!;
                    const dist = row.pHashDistance;
                    const type = clientRelType(dist, row.clipSimilarity);
                    const col = relColor(type);
                    return (
                      <tr key={`${row.a}-${row.b}`} style={{ borderTop: '1px solid #21262d' }}>
                        <td className="py-2 pr-4" style={{ color: '#8b949e' }}>
                          {na.filename.length > 18 ? na.filename.slice(0, 16) + '…' : na.filename}
                        </td>
                        <td className="py-2 pr-4" style={{ color: '#8b949e' }}>
                          {nb.filename.length > 18 ? nb.filename.slice(0, 16) + '…' : nb.filename}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: dist <= 10 ? '#3fb950' : dist <= 20 ? '#d29922' : '#f85149' }}>
                          {dist}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: '#8b949e' }}>
                          {row.clipSimilarity !== null ? `${(row.clipSimilarity * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                            style={{ background: `${col}15`, color: col, border: `1px solid ${col}30` }}
                          >
                            {type}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BatchPage() {
  const [files,      setFiles]      = useState<File[]>([]);
  const [previews,   setPreviews]   = useState<string[]>([]);
  const [dragging,   setDragging]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<BatchResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function validateFile(f: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type as typeof ACCEPTED_IMAGE_TYPES[number]))
      return `"${f.name}" is not a supported image type.`;
    if (f.size > MAX_UPLOAD_SIZE_BYTES)
      return `"${f.name}" exceeds the 10 MB limit.`;
    return null;
  }

  function addFiles(incoming: File[]) {
    const combined = [...files, ...incoming];
    if (combined.length > 10) {
      setError('Maximum 10 images at once.');
      return;
    }
    const err = incoming.map(validateFile).find(Boolean);
    if (err) { setError(err); return; }
    setError(null);
    setResult(null);
    setSelectedId(null);
    const newPreviews = incoming.map((f) => URL.createObjectURL(f));
    setFiles(combined);
    setPreviews((p) => [...p, ...newPreviews]);
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles((f) => f.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
    setResult(null);
    setSelectedId(null);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (dropped.length > 0) addFiles(dropped);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, previews]);

  async function handleAnalyze() {
    if (files.length < 2) { setError('Add at least 2 images to compare.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedId(null);

    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res  = await fetch('/api/images/batch', { method: 'POST', body: fd, signal: ac.signal });
      const data = await res.json() as BatchResult & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Analysis failed.'); return; }
      setResult(data);
      setSelectedId(data.rootId);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setFiles([]); setPreviews([]); setResult(null); setError(null); setSelectedId(null);
  }

  const selectedNode = result?.nodes.find((n) => n.id === selectedId) ?? null;
  const canAnalyze   = files.length >= 2 && !loading;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 lg:p-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
            >
              <Layers size={18} style={{ color: '#3fb950' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#e6edf3' }}>Multi-Image Analyzer</h1>
              <p className="text-xs" style={{ color: '#8b949e' }}>
                Upload 2–10 images — find relationships, build provenance tree
              </p>
            </div>
          </div>
          {(files.length > 0 || result) && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:bg-white/5"
              style={{ color: '#484f58', border: '1px solid #30363d' }}
            >
              <X size={12} /> Clear all
            </button>
          )}
        </div>

        {/* ── Upload zone ───────────────────────────────────────────────── */}
        {!result && (
          <div className="space-y-3">
            {/* drop target */}
            <label
              htmlFor="batch-upload"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all duration-200',
                loading && 'cursor-not-allowed opacity-50'
              )}
              style={{
                borderColor: dragging ? '#1E8449' : '#30363d',
                background:  dragging ? 'rgba(30,132,73,0.05)' : '#161b27',
                minHeight: files.length > 0 ? 100 : 180,
              }}
            >
              <UploadCloud size={24} style={{ color: dragging ? '#3fb950' : '#484f58' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>
                  {dragging ? 'Drop images here' : files.length === 0 ? 'Drop images here' : 'Drop more images'}
                </p>
                <p className="text-xs" style={{ color: '#484f58' }}>
                  or <span style={{ color: '#3fb950' }}>click to browse</span> · 2–10 images · max 10 MB each
                </p>
              </div>
              <input
                id="batch-upload"
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length > 0) addFiles(picked);
                  e.target.value = '';
                }}
                disabled={loading}
              />
            </label>

            {/* preview grid */}
            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {files.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    className="group relative overflow-hidden rounded-xl"
                    style={{ background: '#0d1117', border: '1px solid #30363d', aspectRatio: '1' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-all group-hover:opacity-100"
                      style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #30363d', color: '#f85149' }}
                    >
                      <X size={10} />
                    </button>
                    <div
                      className="absolute bottom-0 left-0 right-0 truncate px-1.5 py-1 text-[9px]"
                      style={{ background: 'rgba(13,17,23,0.8)', color: '#484f58' }}
                    >
                      {f.name.length > 14 ? f.name.slice(0, 12) + '…' : f.name}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* counter + analyze */}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs" style={{ color: '#484f58' }}>
                {files.length === 0 ? 'No images selected' : (
                  <><span style={{ color: files.length >= 2 ? '#3fb950' : '#d29922' }}>{files.length}</span> / 10 images</>
                )}
                {files.length === 1 && <span style={{ color: '#d29922' }}> — add at least one more</span>}
              </p>
              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-7 py-2.5 text-sm font-semibold transition-all duration-150',
                  canAnalyze ? 'hover:brightness-110 active:scale-[0.98]' : 'cursor-not-allowed opacity-40'
                )}
                style={{
                  background: canAnalyze ? 'linear-gradient(135deg, #1E8449, #27ae60)' : '#21262d',
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
                      style={{ border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff' }}
                    />
                    Analyzing {files.length} images…
                  </>
                ) : (
                  <><GitBranch size={15} /> Analyze &amp; Build Tree</>
                )}
              </button>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 text-sm"
                style={{ color: '#f85149' }}
              >
                <AlertCircle size={13} /> {error}
              </motion.p>
            )}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-1 flex-col gap-4"
            >
              {/* summary bar */}
              <div
                className="flex flex-wrap items-center gap-4 rounded-2xl px-5 py-3"
                style={{ background: '#161b27', border: '1px solid #30363d' }}
              >
                {[
                  { label: 'Images',     value: String(result.nodes.length),  color: '#e6edf3' },
                  { label: 'Edges',      value: String(result.edges.length),  color: '#3fb950' },
                  { label: 'Root',       value: result.nodes.find((n) => n.id === result.rootId)?.filename.split('.')[0] ?? '—', color: '#3fb950' },
                  { label: 'Processed',  value: `${(result.processingTime / 1000).toFixed(1)}s`, color: '#484f58' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: '#484f58' }}>{label}</p>
                    <p className="text-sm font-bold truncate max-w-30" style={{ color }}>{value}</p>
                  </div>
                ))}
                <button
                  onClick={reset}
                  className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:bg-white/5"
                  style={{ color: '#484f58', border: '1px solid #30363d' }}
                >
                  <X size={11} /> New batch
                </button>
              </div>

              {/* tree + detail */}
              <div className="flex flex-1 gap-4 min-h-0" style={{ height: 500 }}>
                {/* React Flow tree */}
                <div
                  className="flex-1 overflow-hidden rounded-2xl"
                  style={{ background: '#0d1117', border: '1px solid #30363d' }}
                >
                  <ReactFlowProvider key={result.processingTime}>
                    <InnerFlow
                      result={result}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  </ReactFlowProvider>
                </div>

                {/* Detail panel */}
                <AnimatePresence mode="wait">
                  {selectedNode && (
                    <div className="w-64 shrink-0 overflow-y-auto">
                      <DetailPanel
                        node={selectedNode}
                        isRoot={selectedNode.id === result.rootId}
                        onClose={() => setSelectedId(null)}
                      />
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" style={{ color: '#484f58' }}>
                <span className="font-medium" style={{ color: '#30363d' }}>Edge type:</span>
                {[
                  { type: 'identical',      col: '#3fb950' },
                  { type: 'near-duplicate', col: '#3fb950' },
                  { type: 'similar',        col: '#58a6ff' },
                  { type: 'related',        col: '#d29922' },
                  { type: 'different',      col: '#484f58' },
                ].map(({ type, col }) => (
                  <span key={type} className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-5 rounded" style={{ background: col }} />
                    <span className="capitalize" style={{ color: col }}>{type}</span>
                  </span>
                ))}
                <span className="ml-auto" style={{ color: '#30363d' }}>Click a node to inspect</span>
              </div>

              {/* Similarity matrix (collapsible) */}
              <SimilarityMatrix nodes={result.nodes} matrix={result.matrix} />

            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!result && files.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: '#161b27', border: '1px solid #30363d' }}
            >
              <Layers size={32} style={{ color: '#484f58' }} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium" style={{ color: '#484f58' }}>
                Upload 2–10 images to find their relationships
              </p>
              <p className="max-w-sm text-xs" style={{ color: '#30363d' }}>
                The system fingerprints each image, computes pairwise pHash distance and CLIP similarity,
                determines which is the original, then builds a directed parent/child provenance tree.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {['pHash Hamming Distance', 'CLIP Neural Similarity', 'ELA Edit Detection', 'Prim\'s MST Tree', 'EXIF Analysis'].map((t) => (
                <span key={t} className="rounded-full px-3 py-1 text-xs" style={{ background: '#161b27', border: '1px solid #30363d', color: '#484f58' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
