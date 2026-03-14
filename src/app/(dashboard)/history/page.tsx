'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, Search, RefreshCw, AlertCircle,
  ShieldCheck, ShieldAlert, AlertTriangle,
  ChevronLeft, ChevronRight, ExternalLink,
  Clock, Database, ImageIcon, TreePine, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NodeRecord {
  _id:               string;
  hash:              string;
  cryptoHash:        string;
  cloudinaryUrl:     string;
  cloudinaryPublicId: string;
  metadata: {
    width: number; height: number; format: string; fileSize: number;
    dateCreated: string | null; camera: string | null; software: string | null;
  };
  forensics: {
    isEdited: boolean; elaScore: number; editProbability: number | null;
    editVerdict: 'original' | 'edited' | 'uncertain' | null;
    editingSoftware: string | null;
  };
  children:   string[];
  parentHash: string | null;
  depth:      number;
  uploadedAt: string;
}

interface HistoryResponse {
  status:     string;
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
  nodes:      NodeRecord[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function verdictColor(v: string | null) {
  if (v === 'edited')    return '#f85149';
  if (v === 'uncertain') return '#d29922';
  return '#3fb950';
}

function verdictIcon(v: string | null, size = 13) {
  if (v === 'edited')    return <ShieldAlert  size={size} style={{ color: '#f85149' }} />;
  if (v === 'uncertain') return <AlertTriangle size={size} style={{ color: '#d29922' }} />;
  return <ShieldCheck size={size} style={{ color: '#3fb950' }} />;
}

function verdictLabel(v: string | null) {
  if (v === 'edited')    return 'Edited';
  if (v === 'uncertain') return 'Uncertain';
  return 'Original';
}

function elaColor(score: number) {
  if (score > 0.15) return '#f85149';
  if (score > 0.05) return '#d29922';
  return '#3fb950';
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div
      className="flex gap-4 rounded-xl p-4 animate-pulse"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      <div className="h-20 w-20 shrink-0 rounded-lg" style={{ background: '#21262d' }} />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-3 w-1/2 rounded" style={{ background: '#21262d' }} />
        <div className="h-2.5 w-1/3 rounded" style={{ background: '#1c2333' }} />
        <div className="h-2.5 w-1/4 rounded" style={{ background: '#1c2333' }} />
      </div>
    </div>
  );
}

// ─── Image card ────────────────────────────────────────────────────────────────

function ImageCard({ node, index }: { node: NodeRecord; index: number }) {
  const verdict = node.forensics.editVerdict ?? (node.forensics.isEdited ? 'edited' : 'original');
  const col     = verdictColor(verdict);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
      className="group flex gap-4 rounded-xl p-4 transition-all duration-150 hover:border-white/10"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      {/* Thumbnail */}
      <div
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg"
        style={{ background: '#0d1117', border: '1px solid #21262d' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.cloudinaryUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
        />
        {/* verdict dot */}
        <div
          className="absolute right-1 top-1 h-2 w-2 rounded-full"
          style={{ background: col, boxShadow: `0 0 4px ${col}` }}
        />
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between overflow-hidden">
        <div>
          <div className="flex items-center gap-2">
            {verdictIcon(verdict)}
            <span className="text-xs font-semibold" style={{ color: col }}>
              {verdictLabel(verdict)}
            </span>
            {node.children.length > 0 && (
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs"
                style={{ background: 'rgba(63,185,80,0.08)', color: '#3fb950', border: '1px solid rgba(63,185,80,0.2)' }}
              >
                <TreePine size={9} />
                {node.children.length} {node.children.length === 1 ? 'copy' : 'copies'}
              </span>
            )}
          </div>

          <p className="mt-1 font-mono text-xs truncate" style={{ color: '#484f58' }}>
            {node.hash.slice(0, 28)}…
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-xs" style={{ color: '#484f58' }}>
            <ImageIcon size={10} />
            {node.metadata.format?.toUpperCase() ?? '?'} · {node.metadata.width}×{node.metadata.height}
          </span>
          <span className="text-xs" style={{ color: '#30363d' }}>
            {fileSize(node.metadata.fileSize)}
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: elaColor(node.forensics.elaScore) }}
          >
            ELA {node.forensics.elaScore.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Right col */}
      <div className="flex shrink-0 flex-col items-end justify-between">
        <div className="flex items-center gap-1 text-xs" style={{ color: '#30363d' }}>
          <Clock size={10} />
          {timeAgo(node.uploadedAt)}
        </div>

        <a
          href={node.cloudinaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs opacity-0 transition-all duration-150 group-hover:opacity-100"
          style={{ color: '#484f58', border: '1px solid #30363d' }}
        >
          <ExternalLink size={10} />
          View
        </a>
      </div>
    </motion.div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: '#161b27', border: '1px solid #30363d' }}
      >
        <Database size={26} style={{ color: '#484f58' }} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: '#484f58' }}>
          {search ? `No results for "${search}"` : 'No images analyzed yet'}
        </p>
        <p className="mt-1 text-xs" style={{ color: '#30363d' }}>
          {search ? 'Try a different hash fragment' : 'Images appear here after you run the analyzer'}
        </p>
      </div>
      {!search && (
        <Link
          href="/analyze"
          className="mt-2 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:brightness-110"
          style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)', color: '#3fb950' }}
        >
          Analyze your first image
        </Link>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [data,       setData]       = useState<HistoryResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showAll,    setShowAll]    = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: '20',
        all:   String(showAll),
        ...(search ? { search } : {}),
      });
      const res  = await fetch(`/api/images/history?${params}`);
      const json = await res.json() as HistoryResponse & { error?: string };
      if (!res.ok) { setError(json.error ?? 'Failed to load history'); return; }
      setData(json);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, search, showAll]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-5 p-5 lg:p-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)' }}
            >
              <History size={18} style={{ color: '#3fb950' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#e6edf3' }}>Image History</h1>
              <p className="text-xs" style={{ color: '#8b949e' }}>
                All images analyzed and stored in the database
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchHistory()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 hover:bg-white/5 disabled:opacity-50"
            style={{ color: '#484f58', border: '1px solid #30363d' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2">
            <div
              className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: '#161b27', border: '1px solid #30363d' }}
            >
              <Search size={13} style={{ color: '#484f58', flexShrink: 0 }} />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by hash…"
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#30363d]"
                style={{ color: '#e6edf3' }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                  className="text-xs opacity-50 hover:opacity-100"
                  style={{ color: '#484f58' }}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-150 hover:brightness-110"
              style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.3)', color: '#3fb950' }}
            >
              Search
            </button>
          </form>

          {/* Show all toggle */}
          <button
            onClick={() => { setShowAll(!showAll); setPage(1); }}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-150',
              showAll ? '' : 'hover:bg-white/5'
            )}
            style={{
              background: showAll ? 'rgba(88,166,255,0.08)' : undefined,
              border:     `1px solid ${showAll ? 'rgba(88,166,255,0.3)' : '#30363d'}`,
              color:      showAll ? '#58a6ff' : '#484f58',
            }}
          >
            <Filter size={12} />
            {showAll ? 'All nodes' : 'Root only'}
          </button>
        </div>

        {/* ── Stats bar ───────────────────────────────────────────────── */}
        {data && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-4 text-xs"
            style={{ color: '#484f58' }}
          >
            <span>
              <span style={{ color: '#8b949e' }}>{data.total}</span> total image{data.total !== 1 ? 's' : ''}
            </span>
            <span style={{ color: '#21262d' }}>·</span>
            <span>
              Page <span style={{ color: '#8b949e' }}>{data.page}</span> of <span style={{ color: '#8b949e' }}>{data.totalPages || 1}</span>
            </span>
            {search && (
              <>
                <span style={{ color: '#21262d' }}>·</span>
                <span>matching &ldquo;<span style={{ color: '#58a6ff' }}>{search}</span>&rdquo;</span>
              </>
            )}
          </motion.div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}

        {/* ── List ────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)
          ) : data?.nodes.length === 0 ? (
            <EmptyState search={search} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={`${page}-${search}-${showAll}`} className="space-y-2">
                {data?.nodes.map((node, i) => (
                  <ImageCard key={node._id} node={node} index={i} />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* ── Pagination ──────────────────────────────────────────────── */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ color: '#8b949e', border: '1px solid #30363d' }}
            >
              <ChevronLeft size={13} />
              Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, data.totalPages) }, (_, i) => {
                let p: number;
                if (data.totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= data.totalPages - 3) {
                  p = data.totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                const active = p === page;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-all duration-100"
                    style={{
                      background: active ? 'rgba(63,185,80,0.12)' : undefined,
                      border:     `1px solid ${active ? 'rgba(63,185,80,0.3)' : 'transparent'}`,
                      color:      active ? '#3fb950' : '#484f58',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages || loading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ color: '#8b949e', border: '1px solid #30363d' }}
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
