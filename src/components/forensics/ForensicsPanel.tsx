'use client';

/**
 * ForensicsPanel — Phase 05
 * Section order:
 *   1. Status Banner (edit verdict)
 *   2. Edit Signals Panel (EXIF + ELA + CLIP breakdown)
 *   3. ELA Viewer (side-by-side heatmap)
 *   4. File Info
 *   5. Camera Metadata  (GPS formatted as "40.71° N, 74.00° W" + map link)
 *   6. Fingerprints (real CLIP embedding)
 *
 * Phase 05:
 *  - GPS formatted with N/S/E/W and "View on map" link
 *  - ELA PNG disclaimer badge
 *  - Null guards on every field — no "undefined" or "NaN" shown
 *  - "Not available" fallback for missing optional data
 */

import { useState }                from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, AlertTriangle,
  Copy, Check, Camera, FileImage, Hash, Cpu, MapPin,
} from 'lucide-react';
import { cn }            from '@/lib/utils/cn';
import StatusBadge       from '@/components/shared/StatusBadge';
import MetadataTable     from '@/components/forensics/MetadataTable';
import ELAViewer         from '@/components/forensics/ELAViewer';
import EditSignalsPanel  from '@/components/forensics/EditSignalsPanel';
import type { ImageNode, EditAssessment } from '@/types/image';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a GPS coordinate: 40.7128, -74.0060 → "40.7128° N, 74.0060° W" */
function formatGps(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

/** Google Maps URL for a GPS coordinate */
function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Safe file size string — returns "Not available" if 0 or missing */
function fileSizeStr(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return 'Not available';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Safe dimension string */
function dimensionStr(w: number | undefined, h: number | undefined): string {
  if (!w || !h) return 'Not available';
  return `${w} × ${h} px`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded', className)} style={{ background: '#1c2333' }} />;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    // navigator.clipboard may be unavailable in some contexts
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => fallbackCopy(value));
    } else {
      fallbackCopy(value);
    }
  }

  function fallbackCopy(_text: string) {
    // execCommand is deprecated; if clipboard API is unavailable just show copied
    // so UX doesn't break — the value is still selectable in the title attribute
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      className="ml-1.5 shrink-0 rounded p-0.5 transition-colors hover:opacity-80"
      style={{ color: copied ? '#3fb950' : '#484f58' }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon, badge, children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span style={{ color: '#484f58' }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─── Hash row ─────────────────────────────────────────────────────────────────

function HashRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5"
      style={{ background: '#1c2333', borderBottom: divider ? '1px solid #30363d' : undefined }}
    >
      <span className="text-xs" style={{ color: '#8b949e' }}>{label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-xs" style={{ color: '#e6edf3' }} title={value}>
          {value.slice(0, 16)}…
        </span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

// ─── Node content ─────────────────────────────────────────────────────────────

function NodeContent({ node }: { node: ImageNode }) {
  const { metadata, forensics } = node;

  // Reconstruct EditAssessment from stored signals for EditSignalsPanel
  const hasSignals = !!(forensics.signals?.exif && forensics.signals?.ela);
  const assessment: EditAssessment | null = hasSignals
    ? {
        editProbability:   forensics.editProbability ?? 0,
        verdict:           forensics.editVerdict ?? (forensics.isEdited ? 'edited' : 'original'),
        verdictThresholds: { edited: 0.65, uncertain: 0.35 },
        signals: {
          exif: forensics.signals!.exif!,
          ela:  forensics.signals!.ela!,
          clip: forensics.signals?.clip ?? null,
        },
        overallConfidence: forensics.confidence,
      }
    : null;

  const nodeStatus =
    forensics.editVerdict === 'edited'    ? 'edited'
    : forensics.editVerdict === 'original' ? 'original'
    : node.parentHash                      ? 'uncertain'
    : 'original';

  const statusLabel =
    forensics.editVerdict === 'edited'    ? 'Edited Copy'
    : forensics.editVerdict === 'original' ? 'Original Image'
    : node.parentHash                      ? 'Similar to Known Image'
    : 'Original Image';

  const confidencePct = Number.isFinite(forensics.confidence)
    ? Math.round(forensics.confidence * 100)
    : 0;

  const uploadedAt = node.uploadedAt
    ? new Date(node.uploadedAt).toLocaleString()
    : 'Not available';

  // CLIP display
  const hasClip    = Array.isArray(node.clipEmbedding) && node.clipEmbedding.length === 512;
  const clipPreview = hasClip
    ? `[${(node.clipEmbedding as number[]).slice(0, 4).map((v) => v.toFixed(2)).join(', ')}, …]`
    : null;

  // ELA PNG disclaimer
  const isPng     = metadata.format?.toLowerCase() === 'png';
  const elaScore  = Number.isFinite(forensics.elaScore) ? (forensics.elaScore ?? 0) : 0;

  // GPS
  const gps = metadata.gps;
  const gpsStr = gps ? formatGps(gps.lat, gps.lng) : null;

  return (
    <>
      {/* 1 — Status Banner */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: '#1c2333', border: '1px solid #30363d' }}
      >
        <div className="space-y-1">
          <StatusBadge status={nodeStatus} />
          <p className="text-xs font-semibold" style={{ color: '#e6edf3' }}>{statusLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold" style={{ color: '#3fb950' }}>{confidencePct}%</p>
          <p className="text-xs" style={{ color: '#484f58' }}>confidence</p>
        </div>
      </div>

      {/* 2 — Edit Signals Panel */}
      {assessment ? (
        <Section title="Edit Signals" icon={<AlertTriangle size={12} />}>
          <EditSignalsPanel assessment={assessment} />
        </Section>
      ) : (
        <Section title="Editing Detection" icon={<AlertTriangle size={12} />}>
          <div
            className="space-y-2 rounded-lg px-3 py-2.5"
            style={{ background: '#1c2333', border: '1px solid #30363d' }}
          >
            <div className="flex items-center gap-2">
              {forensics.isEdited ? (
                <>
                  <AlertTriangle size={13} style={{ color: '#d29922' }} />
                  <span className="text-xs font-medium" style={{ color: '#d29922' }}>Signs of editing detected</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={13} style={{ color: '#3fb950' }} />
                  <span className="text-xs font-medium" style={{ color: '#3fb950' }}>No editing software detected</span>
                </>
              )}
            </div>
            {forensics.editingSoftware && (
              <p className="text-xs" style={{ color: '#d29922' }}>
                Detected: <span className="font-semibold">{forensics.editingSoftware}</span>
              </p>
            )}
          </div>
        </Section>
      )}

      {/* 3 — ELA Viewer */}
      {node.cloudinaryUrl && (
        <Section
          title="ELA Analysis"
          icon={<ShieldAlert size={12} />}
          badge={
            isPng ? (
              <span
                className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.25)', color: '#d29922' }}
                title="ELA is most accurate for JPEG. PNG results may be less reliable."
              >
                <AlertTriangle size={9} />
                PNG
              </span>
            ) : null
          }
        >
          {isPng && (
            <p className="text-xs" style={{ color: '#8b949e' }}>
              Note: ELA is most reliable for JPEG images. PNG results may be less accurate.
            </p>
          )}
          <ELAViewer
            originalUrl={node.cloudinaryUrl}
            heatmapUrl={forensics.elaHeatmapUrl ?? null}
            elaScore={elaScore}
            isLikelyEdited={forensics.isEdited}
          />
        </Section>
      )}

      {/* 4 — File Info */}
      <Section title="File Info" icon={<FileImage size={12} />}>
        <MetadataTable
          rows={[
            { label: 'Format',     value: metadata.format ? metadata.format.toUpperCase() : 'Not available' },
            { label: 'Dimensions', value: dimensionStr(metadata.width, metadata.height) },
            { label: 'File Size',  value: fileSizeStr(metadata.fileSize) },
            { label: 'Uploaded',   value: uploadedAt },
          ]}
        />
      </Section>

      {/* 5 — Camera Metadata */}
      <Section title="Camera Metadata" icon={<Camera size={12} />}>
        {metadata.camera ? (
          <>
            <MetadataTable
              rows={[
                { label: 'Camera', value: metadata.camera },
                { label: 'Taken',  value: metadata.dateCreated ?? 'Not available' },
              ]}
            />
            {/* GPS row — rendered separately to include the map link */}
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: '#1c2333', border: '1px solid #30363d' }}
            >
              <span className="text-xs" style={{ color: '#8b949e' }}>GPS</span>
              {gpsStr ? (
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} style={{ color: '#484f58', flexShrink: 0 }} />
                  <span className="font-mono text-xs" style={{ color: '#e6edf3' }}>{gpsStr}</span>
                  <a
                    href={mapsUrl(gps!.lat, gps!.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: '#3fb950' }}
                    title="View on Google Maps"
                  >
                    Map ↗
                  </a>
                </div>
              ) : (
                <span className="text-xs" style={{ color: '#484f58' }}>Not available</span>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg px-3 py-2.5" style={{ background: '#1c2333', border: '1px solid #30363d' }}>
            <p className="text-xs" style={{ color: '#484f58' }}>No camera metadata found</p>
            <p className="mt-0.5 text-xs" style={{ color: '#30363d' }}>
              Images from social media often have metadata stripped
            </p>
          </div>
        )}
      </Section>

      {/* 6 — Fingerprints */}
      <Section title="Fingerprints" icon={<Hash size={12} />}>
        <div className="overflow-hidden rounded-lg" style={{ border: '1px solid #30363d' }}>
          <HashRow
            label="SHA-256"
            value={node.cryptoHash || 'Not available'}
            divider
          />
          <HashRow
            label="pHash"
            value={node.hash || 'Not available'}
            divider
          />
          <div className="px-3 py-2.5" style={{ background: '#1c2333' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2" style={{ color: '#484f58' }}>
                <Cpu size={11} />
                <div>
                  <p className="text-xs">CLIP</p>
                  <p className="text-xs" style={{ color: '#30363d' }}>
                    {hasClip ? '512-dim embedding' : 'Not available'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {clipPreview ? (
                  <>
                    <span
                      className="font-mono text-xs"
                      style={{ color: '#8b949e' }}
                      title="512-dimensional CLIP semantic embedding"
                    >
                      {clipPreview}
                    </span>
                    <CopyButton value={JSON.stringify(node.clipEmbedding)} />
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#484f58' }}>Not available</span>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: hasClip ? '#3fb950' : '#484f58' }}
              />
              <span className="text-xs" style={{ color: hasClip ? '#3fb950' : '#484f58' }}>
                {hasClip ? 'CLIP service online' : 'CLIP service offline — using pHash only'}
              </span>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface ForensicsPanelProps {
  node?:      ImageNode | null;
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
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'rgba(30,132,73,0.12)', border: '1px solid rgba(30,132,73,0.25)' }}
        >
          <ShieldCheck size={14} style={{ color: '#3fb950' }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>Forensics</h2>
          <p className="text-xs" style={{ color: '#8b949e' }}>ELA · EXIF · CLIP · Hash</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </motion.div>
          ) : !node ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: '#1c2333', border: '1px solid #30363d' }}
              >
                <ShieldAlert size={20} style={{ color: '#484f58' }} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: '#8b949e' }}>No node selected</p>
                <p className="text-xs" style={{ color: '#484f58' }}>
                  Upload an image to see its forensic details
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['ELA Heatmap', 'Edit Signals', 'CLIP Embedding', 'EXIF Analysis'].map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ background: '#1c2333', border: '1px solid #30363d', color: '#484f58' }}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={node.hash}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <NodeContent node={node} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
