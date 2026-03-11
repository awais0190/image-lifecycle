'use client';

/**
 * NodeCard — React Flow custom node (STUB)
 *
 * TODO Phase 03:
 *   1. Accept NodeProps from @xyflow/react
 *   2. Render thumbnail, StatusBadge, pHash fragment, depth indicator
 *   3. Highlight selected node with emerald glow ring
 *   4. Show ELA score as a small progress bar
 *   5. Wire handle connectors (source/target) for tree edges
 */

import type { TreeNode } from '@/types/image';
import StatusBadge from '@/components/shared/StatusBadge';

interface NodeCardProps {
  node: TreeNode;
  isSelected?: boolean;
}

export default function NodeCard({ node, isSelected = false }: NodeCardProps) {
  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{
        background:  '#16213e',
        border:      `1px solid ${isSelected ? '#1E8449' : '#2d3748'}`,
        boxShadow:   isSelected ? '0 0 12px rgba(30,132,73,0.3)' : 'none',
        minWidth:    '140px',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span style={{ color: '#8892a4' }}>
          #{node.id.slice(0, 8)}
        </span>
        <StatusBadge status={node.data.status} />
      </div>

      {/* TODO Phase 03: replace with actual thumbnail + ELA heatmap toggle */}
      <div
        className="mb-2 h-16 w-full rounded"
        style={{ background: '#1a1a2e', border: '1px solid #2d3748' }}
      />

      <p style={{ color: '#8892a4' }}>
        Depth: {node.data.depth}
      </p>
    </div>
  );
}
