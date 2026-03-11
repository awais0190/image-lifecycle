'use client';

/**
 * TreeCanvas — React Flow provenance tree (STUB).
 * TODO Phase 03: replace stub with @xyflow/react implementation.
 */

import EmptyState from '@/components/shared/EmptyState';
import type { TreeNode } from '@/types/image';
import { cn } from '@/lib/utils/cn';

interface TreeCanvasProps {
  nodes?: TreeNode[];
  onNodeSelect?: (node: TreeNode) => void;
  className?: string;
}

export default function TreeCanvas({ nodes, onNodeSelect: _onNodeSelect, className }: TreeCanvasProps) {
  const hasNodes = nodes && nodes.length > 0;

  return (
    <div
      className={cn('relative overflow-hidden rounded-xl', className)}
      style={{
        background:   '#0d1117',
        border:       '1px solid #30363d',
        minHeight:    '420px',
      }}
    >
      {/* Dot-grid background */}
      <div
        className="dot-grid absolute inset-0 opacity-30 pointer-events-none"
      />

      {/* Corner label */}
      <div
        className="absolute right-3 top-3 z-10 rounded-md px-2.5 py-1 text-xs font-mono"
        style={{
          background: 'rgba(13,17,23,0.8)',
          border:     '1px solid #30363d',
          color:      '#484f58',
        }}
      >
        PROVENANCE GRAPH
      </div>

      {!hasNodes ? (
        <div className="relative z-10 flex h-full min-h-[420px] items-center justify-center">
          <EmptyState />
        </div>
      ) : (
        /* TODO Phase 03: <ReactFlow nodes={...} edges={...} /> */
        <div className="relative z-10 flex h-full items-center justify-center">
          <p className="text-sm" style={{ color: '#8b949e' }}>Tree rendering coming in Phase 03</p>
        </div>
      )}
    </div>
  );
}
