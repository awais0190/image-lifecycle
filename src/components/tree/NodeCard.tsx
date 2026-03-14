'use client';

/**
 * NodeCard — Phase 03
 * Slide-in detail panel shown when the user clicks a node in the tree canvas.
 * Overlays the right panel from the right edge.
 */

import { useState }                from 'react';
import { motion }                  from 'framer-motion';
import {
  X, ExternalLink, Copy, Check,
  Camera, FileImage, Hash, AlertTriangle, ShieldCheck,
}                                  from 'lucide-react';
import StatusBadge                 from '@/components/shared/StatusBadge';
import MetadataTable               from '@/components/forensics/MetadataTable';
import type { TreeJSON }           from '@/types/image';
import type { NodeStatusValue }    from '@/lib/utils/constants';

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      className="shrink-0 rounded p-0.5 transition-colors hover:opacity-80"
      style={{ color: copied ? '#3fb950' : '#484f58' }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#484f58' }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface NodeCardProps {
  node:    TreeJSON | null;
  onClose: () => void;
}

export default function NodeCard({ node, onClose }: NodeCardProps) {
  if (!node) return null;

  const { metadata, forensics, sources } = node;
  const fileSizeStr =
    metadata.fileSize >= 1024 * 1024
      ? `${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB`
      : `${(metadata.fileSize / 1024).toFixed(1)} KB`;

  const sourceUrl = sources?.[0]?.url;
  const platform  = sources?.[0]?.platform ?? 'Uploaded';

  return (
    <motion.div
      key={node.hash}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0,      opacity: 1 }}
      exit={{    x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute inset-y-0 right-0 z-20 flex flex-col overflow-y-auto"
      style={{
        width:      340,
        background: '#161b27',
        borderLeft: '1px solid #30363d',
        boxShadow:  '-8px 0 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        <div className="flex items-center gap-2">
          <StatusBadge status={node.status as NodeStatusValue} />
          <span className="text-xs" style={{ color: '#484f58' }}>{platform}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 transition-colors hover:opacity-70"
          style={{ color: '#8b949e' }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="shrink-0 px-4 pt-4">
        {node.cloudinaryUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.cloudinaryUrl}
            alt="Node image"
            className="w-full rounded-lg object-contain"
            style={{ maxHeight: 200, background: '#0d1117' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-lg"
            style={{ height: 200, background: '#0d1117', border: '1px solid #30363d' }}
          >
            <span style={{ fontSize: 40 }}>🖼</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-5 overflow-y-auto p-4">

        {/* Source URL */}
        {sourceUrl && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: '#1c2333', border: '1px solid #30363d' }}
          >
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-xs hover:underline"
              style={{ color: '#3fb950' }}
              title={sourceUrl}
            >
              {sourceUrl}
            </a>
            <ExternalLink size={12} style={{ color: '#484f58', flexShrink: 0 }} />
          </div>
        )}

        {/* Source count */}
        {sources?.length > 1 && (
          <p className="text-xs" style={{ color: '#484f58' }}>
            Found on <span style={{ color: '#e6edf3' }}>{sources.length}</span> pages
          </p>
        )}

        {/* File info */}
        <Section title="File Info" icon={<FileImage size={12} />}>
          <MetadataTable
            rows={[
              { label: 'Format',     value: metadata.format?.toUpperCase() ?? null },
              { label: 'Dimensions', value: `${metadata.width} × ${metadata.height} px` },
              { label: 'File Size',  value: fileSizeStr },
              { label: 'Level',      value: `Depth ${node.depth}` },
            ]}
          />
        </Section>

        {/* Camera */}
        {metadata.camera && (
          <Section title="Camera" icon={<Camera size={12} />}>
            <MetadataTable
              rows={[
                { label: 'Camera',   value: metadata.camera },
                { label: 'Taken',    value: metadata.dateCreated ?? null },
                { label: 'GPS',      value: metadata.gps ? `${metadata.gps.lat.toFixed(5)}, ${metadata.gps.lng.toFixed(5)}` : null, icon: 'pin' },
              ]}
            />
          </Section>
        )}

        {/* Editing detection */}
        <Section title="Editing" icon={<AlertTriangle size={12} />}>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{ background: '#1c2333', border: '1px solid #30363d' }}
          >
            {forensics.isEdited ? (
              <>
                <AlertTriangle size={13} style={{ color: '#d29922' }} />
                <span className="text-xs" style={{ color: '#d29922' }}>
                  {forensics.editingSoftware
                    ? `Edited with ${forensics.editingSoftware}`
                    : 'Signs of editing detected'}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck size={13} style={{ color: '#3fb950' }} />
                <span className="text-xs" style={{ color: '#3fb950' }}>No editing detected</span>
              </>
            )}
          </div>
        </Section>

        {/* Fingerprints */}
        <Section title="Fingerprints" icon={<Hash size={12} />}>
          <div className="space-y-1">
            {[
              { label: 'pHash',   value: node.hash },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: '#1c2333', border: '1px solid #30363d' }}
              >
                <span className="text-xs" style={{ color: '#8b949e' }}>{label}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs" style={{ color: '#e6edf3' }} title={value}>
                    {value.slice(0, 14)}…
                  </span>
                  <CopyBtn value={value} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Children count */}
        {node.children.length > 0 && (
          <p className="text-xs" style={{ color: '#484f58' }}>
            <span style={{ color: '#e6edf3' }}>{node.children.length}</span> child node{node.children.length !== 1 ? 's' : ''} in tree
          </p>
        )}
      </div>
    </motion.div>
  );
}
