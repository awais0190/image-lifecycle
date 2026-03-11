'use client';

/**
 * ForensicsPanel — TODO Phase 02: full ELA + metadata forensics.
 */

import { ShieldCheck, ShieldAlert, Loader2, Activity, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ImageNode } from '@/types/image';

interface ForensicsPanelProps {
  node?: ImageNode | null;
  isLoading?: boolean;
  className?: string;
}

export default function ForensicsPanel({ node, isLoading = false, className }: ForensicsPanelProps) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-xl', className)}
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.25)' }}
        >
          <ShieldCheck size={14} style={{ color: '#3fb950' }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>
            Forensics
          </h2>
          <p className="text-xs" style={{ color: '#8b949e' }}>ELA · EXIF · Hash analysis</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 size={22} className="animate-spin" style={{ color: '#3fb950' }} />
            <p className="text-xs" style={{ color: '#8b949e' }}>Running forensic analysis…</p>
          </div>
        ) : !node ? (
          /* Empty */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: '#1c2333', border: '1px solid #30363d' }}
            >
              <ShieldAlert size={20} style={{ color: '#484f58' }} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium" style={{ color: '#8b949e' }}>
                No node selected
              </p>
              <p className="text-xs" style={{ color: '#484f58' }}>
                Click a node in the tree to inspect its forensic details
              </p>
            </div>
            {/* Capability pills */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {['ELA Heatmap', 'Confidence Score', 'Edit Detection', 'EXIF Anomalies'].map((cap) => (
                <span
                  key={cap}
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{ background: '#1c2333', border: '1px solid #30363d', color: '#484f58' }}
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Node data */
          <div className="space-y-3">
            <Row
              icon={<Activity size={13} />}
              label="ELA Score"
              value={`${node.forensics.elaScore} / 100`}
              valueColor={node.forensics.elaScore > 60 ? '#f85149' : '#3fb950'}
            />
            <Row
              icon={<Cpu size={13} />}
              label="Confidence"
              value={`${(node.forensics.confidence * 100).toFixed(1)}%`}
            />
            <Row
              icon={<ShieldCheck size={13} />}
              label="Edited"
              value={node.forensics.isEdited ? 'Yes' : 'No'}
              valueColor={node.forensics.isEdited ? '#f85149' : '#3fb950'}
            />
            {node.forensics.editingSoftware && (
              <Row label="Software" value={node.forensics.editingSoftware} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  valueColor = '#e6edf3',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{ background: '#1c2333', border: '1px solid #30363d' }}
    >
      <div className="flex items-center gap-2" style={{ color: '#8b949e' }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-semibold" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}
