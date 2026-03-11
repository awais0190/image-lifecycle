'use client';

/**
 * Dashboard Page — image submission + provenance tree view.
 *
 * Layout (desktop):  left sidebar (380px fixed) | right canvas (flex-1)
 * Layout (mobile):   stacked vertically
 *
 * TODO Phase 02: wire handleFileSelect / handleUrlSubmit to POST /api/images/analyze
 * TODO Phase 03: pass analysisResult.tree to TreeCanvas
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import UploadCard     from '@/components/upload/UploadCard';
import TreeCanvas     from '@/components/tree/TreeCanvas';
import ForensicsPanel from '@/components/forensics/ForensicsPanel';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

import type { AnalysisResult, ImageNode, TreeNode } from '@/types/image';

export default function DashboardPage() {
  const [isAnalyzing,    setIsAnalyzing]    = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedNode,   setSelectedNode]   = useState<ImageNode | null>(null);

  async function handleFileSelect(file: File) {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setSelectedNode(null);
    try {
      await new Promise((r) => setTimeout(r, 1800)); // TODO Phase 02
      console.info('[Dashboard] File selected (Phase 02 pending):', file.name);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleUrlSubmit(url: string) {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setSelectedNode(null);
    try {
      await new Promise((r) => setTimeout(r, 1800)); // TODO Phase 02
      console.info('[Dashboard] URL submitted (Phase 02 pending):', url);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleNodeSelect(node: TreeNode) {
    console.info('[Dashboard] Node selected:', node.id); // TODO Phase 03
    setSelectedNode(null);
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">

      {/* ── Loading overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5"
            style={{ background: 'rgba(13,17,23,0.9)', backdropFilter: 'blur(8px)' }}
          >
            <div className="relative flex items-center justify-center">
              <div
                className="absolute h-24 w-24 rounded-full"
                style={{ background: 'rgba(30,132,73,0.06)', border: '1px solid rgba(30,132,73,0.18)' }}
              />
              <LoadingSpinner size="lg" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-semibold" style={{ color: '#e6edf3' }}>
                Tracing image lineage…
              </p>
              <p className="text-sm" style={{ color: '#8b949e' }}>
                Computing hashes · Uploading · Scanning provenance graph
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: '#484f58' }}>
              {['Hash', 'Upload', 'ELA', 'Graph'].map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  <span
                    className="rounded px-2.5 py-1"
                    style={{ background: '#161b27', border: '1px solid #30363d' }}
                  >
                    {step}
                  </span>
                  {i < 3 && <span style={{ color: '#30363d' }}>→</span>}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Left panel ───────────────────────────────────────── */}
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

        <ForensicsPanel
          node={selectedNode}
          isLoading={isAnalyzing}
        />

        {analysisResult && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-4 py-3"
            style={{ background: '#161b27', border: '1px solid #30363d' }}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
              Result
            </p>
            <div className="space-y-1.5">
              <StatRow label="Processing time" value={`${analysisResult.processingTime}ms`} />
              <StatRow label="Tree nodes" value={`${analysisResult.tree.length}`} />
            </div>
          </motion.div>
        )}

        <div className="mt-auto pt-2">
          <p className="text-center text-xs" style={{ color: '#484f58' }}>
            Phase 01 · Analysis pipeline coming in Phase 02
          </p>
        </div>
      </motion.aside>

      {/* ── Right panel: tree canvas ─────────────────────────── */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-1 flex-col p-4 lg:p-5"
        style={{ minHeight: '400px' }}
      >
        {/* Canvas header */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
            Provenance Tree
          </span>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#484f58' }}>
            <span
              className="h-1.5 w-1.5 rounded-full transition-all"
              style={{
                background: isAnalyzing ? '#3fb950' : '#484f58',
                boxShadow:  isAnalyzing ? '0 0 6px #3fb950' : 'none',
              }}
            />
            {isAnalyzing ? 'Processing' : 'Idle'}
          </div>
        </div>

        <TreeCanvas
          nodes={analysisResult?.tree}
          onNodeSelect={handleNodeSelect}
          className="flex-1"
        />
      </motion.section>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span className="font-semibold" style={{ color: '#e6edf3' }}>{value}</span>
    </div>
  );
}
