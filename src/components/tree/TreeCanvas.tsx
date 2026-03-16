'use client';

/**
 * TreeCanvas — 
 * React Flow provenance tree with dagre layout.
 *
 *  additions:
 *  - selectedNodeHash prop → passes `selected` to ImageNodeCard
 *  - key={rootHash} on ReactFlowProvider → forces full re-render when tree changes
 *  - fitViewOnInit + fitView after data arrival
 */

import { useCallback, useMemo }    from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeTypes,
  useReactFlow,
  ReactFlowProvider,
}                                  from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre                       from 'dagre';

import EmptyState                  from '@/components/shared/EmptyState';
import LoadingSpinner              from '@/components/shared/LoadingSpinner';
import { ImageNodeCard }           from '@/components/tree/ImageNodeCard';
import { cn }                      from '@/lib/utils/cn';
import { STATUS_COLORS, EDIT_PROBABILITY_THRESHOLDS } from '@/lib/utils/constants';
import type { TreeJSON, NodeStatus } from '@/types/image';
import type { NodeStatusValue }    from '@/lib/utils/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 115;

// ─── dagre layout ─────────────────────────────────────────────────────────────

function getLayoutedElements(nodes: RFNode[], edges: RFEdge[]): { nodes: RFNode[]; edges: RFEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 60 });
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

// ─── Edge styling ─────────────────────────────────────────────────────────────

/**
 * Determine edge style + label from child's forensics data.
 * Uses editProbability when available, falls back to status.
 */
function buildEdge(parentHash: string, child: TreeJSON): RFEdge {
  const editProb    = child.forensics?.editProbability;
  const status      = child.status as NodeStatus;
  const isDuplicate = status === 'duplicate';

  let color: string;
  let dash:  string | undefined;
  let label: string;

  if (isDuplicate) {
    color = '#8b949e';
    dash  = '2 2';
    label = 'Duplicate';
  } else if (typeof editProb === 'number') {
    if (editProb >= EDIT_PROBABILITY_THRESHOLDS.EDITED) {
      color = '#f85149';
      dash  = '6 4';
      label = 'Edited';
    } else if (editProb >= EDIT_PROBABILITY_THRESHOLDS.UNCERTAIN) {
      color = '#d29922';
      dash  = '3 3';
      label = 'Uncertain';
    } else {
      color = '#3fb950';
      dash  = undefined;
      label = 'Original';
    }
  } else {
    color = STATUS_COLORS[status as NodeStatusValue] ?? '#8b949e';
    dash  = status === 'edited'    ? '5 4'
          : status === 'uncertain' ? '3 3'
          : undefined;
    label = status.charAt(0).toUpperCase() + status.slice(1);
  }

  return {
    id:           `${parentHash}→${child.hash}`,
    source:       parentHash,
    target:       child.hash,
    label,
    labelStyle:   { fontSize: 9, fill: color, fontFamily: 'monospace' },
    labelBgStyle: { fill: '#0d1117', fillOpacity: 0.85 },
    style:        { stroke: color, strokeWidth: 1.5, strokeDasharray: dash },
    animated:     false,
    type:         'smoothstep',
  };
}

// ─── Tree → React Flow conversion ─────────────────────────────────────────────

function convertTreeToFlow(
  tree:             TreeJSON,
  selectedNodeHash: string | null
): { nodes: RFNode[]; edges: RFEdge[] } {
  const rawNodes: RFNode[] = [];
  const rawEdges: RFEdge[] = [];

  function traverse(node: TreeJSON) {
    rawNodes.push({
      id:       node.hash,
      type:     'imageNode',
      position: { x: 0, y: 0 },
      data:     { ...(node as unknown as Record<string, unknown>), selected: node.hash === selectedNodeHash },
    });
    for (const child of node.children) {
      rawEdges.push(buildEdge(node.hash, child));
      traverse(child);
    }
  }
  traverse(tree);
  return getLayoutedElements(rawNodes, rawEdges);
}

// ─── Custom node types map ────────────────────────────────────────────────────

const nodeTypes: NodeTypes = { imageNode: ImageNodeCard as unknown as NodeTypes['imageNode'] };

// ─── Inner canvas ─────────────────────────────────────────────────────────────

interface InnerCanvasProps {
  tree:             TreeJSON;
  onNodeClick:      (node: TreeJSON) => void;
  selectedNodeHash: string | null;
}

function InnerCanvas({ tree, onNodeClick, selectedNodeHash }: InnerCanvasProps) {
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(
    () => convertTreeToFlow(tree, selectedNodeHash),
    [tree, selectedNodeHash]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, rfNode: RFNode) => { onNodeClick(rfNode.data as unknown as TreeJSON); },
    [onNodeClick]
  );

  const handleInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onInit={handleInit}
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      proOptions={{ hideAttribution: true }}
      style={{ background: 'transparent' }}
    >
      <Background variant={BackgroundVariant.Dots} color="#30363d" gap={22} size={1} />
      <Controls style={{ background: '#161b27', border: '1px solid #30363d', borderRadius: 8 }} />
      <MiniMap
        style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8 }}
        nodeColor={(n) => STATUS_COLORS[(n.data as unknown as TreeJSON)?.status as NodeStatusValue] ?? '#484f58'}
        maskColor="rgba(13,17,23,0.7)"
      />
    </ReactFlow>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface TreeCanvasProps {
  tree?:             TreeJSON | null;
  onNodeClick?:      (node: TreeJSON) => void;
  isLoading?:        boolean;
  selectedNodeHash?: string | null;
  className?:        string;
}

export default function TreeCanvas({
  tree,
  onNodeClick,
  isLoading        = false,
  selectedNodeHash = null,
  className,
}: TreeCanvasProps) {
  const hasTree = !!tree;

  return (
    <div
      className={cn('relative overflow-hidden rounded-xl', className)}
      style={{ background: '#0d1117', border: '1px solid #30363d', minHeight: 420 }}
    >
      <div
        className="absolute right-3 top-3 z-10 rounded-md px-2.5 py-1 text-xs font-mono pointer-events-none"
        style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid #30363d', color: '#484f58' }}
      >
        PROVENANCE GRAPH
      </div>

      {isLoading && (
        <div className="flex min-h-105 h-full items-center justify-center flex-col gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-sm" style={{ color: '#8b949e' }}>Building image lineage tree…</p>
        </div>
      )}

      {!isLoading && !hasTree && (
        <>
          <div className="dot-grid absolute inset-0 opacity-30 pointer-events-none" />
          <div className="relative z-10 flex min-h-105 h-full items-center justify-center">
            <EmptyState />
          </div>
        </>
      )}

      {!isLoading && hasTree && (
        <div style={{ width: '100%', height: '100%', minHeight: 420 }}>
          {/* key=rootHash forces full unmount/remount when a new tree arrives */}
          <ReactFlowProvider key={tree.hash}>
            <InnerCanvas
              tree={tree}
              onNodeClick={onNodeClick ?? (() => {})}
              selectedNodeHash={selectedNodeHash}
            />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
