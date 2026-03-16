'use client';

/**
 * EditTypeCards — shows a 2-card row summarising colour and object-diff results
 * from the advanced edit analysis (FullEditReport).
 *
 * Renders nothing when editReport is null / undefined.
 */

import type { ForensicsResult } from '@/types/image';

type Report = NonNullable<ForensicsResult['editReport']>;

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = {
  green:  { bg: 'rgba(30,132,73,0.10)',  border: 'rgba(30,132,73,0.25)',  text: '#3fb950' },
  amber:  { bg: 'rgba(210,153,34,0.10)', border: 'rgba(210,153,34,0.25)', text: '#d29922' },
  red:    { bg: 'rgba(248,81,73,0.10)',  border: 'rgba(248,81,73,0.25)',  text: '#f85149' },
  gray:   { bg: '#1c2333',               border: '#30363d',                text: '#484f58' },
};

function palette(bad: boolean, exists: boolean) {
  if (!exists) return COLORS.gray;
  return bad ? COLORS.red : COLORS.green;
}

// ── Single card ───────────────────────────────────────────────────────────────

function EditCard({
  icon, title, value, detail, bad, exists,
}: {
  icon:   string;
  title:  string;
  value:  string;
  detail: string;
  bad:    boolean;
  exists: boolean;
}) {
  const pal = palette(bad, exists);
  return (
    <div
      className="flex-1 rounded-lg p-3 space-y-0.5"
      style={{ background: pal.bg, border: `1px solid ${pal.border}` }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span className="text-xs font-semibold" style={{ color: '#8b949e' }}>{title}</span>
      </div>
      <p className="text-xs font-bold" style={{ color: pal.text }}>{value}</p>
      {detail && (
        <p className="text-xs" style={{ color: '#484f58' }}>{detail}</p>
      )}
    </div>
  );
}

// ── Severity banner ───────────────────────────────────────────────────────────

function SeverityBanner({ severity, summary }: { severity: string; summary: string }) {
  const pal =
    severity === 'major'    ? COLORS.red   :
    severity === 'moderate' ? COLORS.amber :
    severity === 'minor'    ? COLORS.amber :
    COLORS.green;

  const label =
    severity === 'major'    ? 'Heavily edited image'       :
    severity === 'moderate' ? 'Moderate editing detected'  :
    severity === 'minor'    ? 'Minor edits detected'       :
    'No edits detected';

  return (
    <div
      className="rounded-lg px-3 py-2 space-y-0.5"
      style={{ background: pal.bg, border: `1px solid ${pal.border}` }}
    >
      <p className="text-xs font-semibold" style={{ color: pal.text }}>{label}</p>
      <p className="text-xs" style={{ color: '#8b949e' }}>{summary}</p>
    </div>
  );
}

// ── Diff heatmap ─────────────────────────────────────────────────────────────

function DiffHeatmap({ b64 }: { b64: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#484f58' }}>
        Change Map
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${b64}`}
        alt="Pixel diff heatmap"
        className="w-full rounded-lg"
        style={{ border: '1px solid #30363d' }}
      />
      <p className="text-xs" style={{ color: '#484f58' }}>
        Green = added · Red = removed · Yellow = modified
      </p>
    </div>
  );
}

// ── Exported component ────────────────────────────────────────────────────────

interface EditTypeCardsProps {
  editReport: Report;
}

export default function EditTypeCards({ editReport }: EditTypeCardsProps) {
  const { overall, color, objects } = editReport;

  // ── Colour card ─────────────────────────────────────────────────────────
  const colorBad    = color?.color_changed ?? false;
  const colorExists = color != null && !('skipped' in color && color.skipped);
  const colorType   = color?.change_type ?? 'none';
  const colorValue  = colorBad
    ? (colorType === 'filter'       ? 'Filter Applied'
    :  colorType === 'hue_shift'    ? 'Hue Shifted'
    :  colorType === 'desaturated'  ? 'Desaturated'
    :  colorType === 'brightened'   ? 'Brightened'
    :  colorType === 'darkened'     ? 'Darkened'
    :                                 'Color Changed')
    : 'No Change';
  const colorDetail = colorBad && color?.details
    ? [
        color.details.hue_shift      ? `Hue ${color.details.hue_shift.toFixed(0)}°` : null,
        color.details.saturation_change !== 0
          ? `Sat ${color.details.saturation_change > 0 ? '+' : ''}${color.details.saturation_change.toFixed(0)}`
          : null,
        color.details.brightness_change !== 0
          ? `Bright ${color.details.brightness_change > 0 ? '+' : ''}${color.details.brightness_change.toFixed(0)}`
          : null,
      ].filter(Boolean).join(' · ')
    : '';

  // ── Objects card ────────────────────────────────────────────────────────
  const objBad    = objects?.objects_changed ?? false;
  const objExists = objects != null && !('skipped' in objects && objects.skipped);
  const objValue  = objBad
    ? `${(objects?.total_changed_area ?? 0).toFixed(0)}% Changed`
    : 'Unchanged';
  const addedR   = (objects?.regions ?? []).filter((r) => r.type === 'added').length;
  const removedR = (objects?.regions ?? []).filter((r) => r.type === 'removed').length;
  const objDetail = objBad
    ? [addedR ? `${addedR} added` : null, removedR ? `${removedR} removed` : null]
        .filter(Boolean).join(', ') || 'Modified regions'
    : '';

  const heatmap = objects?.diff_heatmap_base64 ?? null;

  return (
    <div className="space-y-3">
      {/* Two cards in a row */}
      <div className="flex gap-2">
        <EditCard
          icon="🎨" title="Color Changes"
          value={colorValue} detail={colorDetail}
          bad={colorBad} exists={colorExists}
        />
        <EditCard
          icon="🔍" title="Object Changes"
          value={objValue} detail={objDetail}
          bad={objBad} exists={objExists}
        />
      </div>

      {/* Severity + summary */}
      <SeverityBanner severity={overall.severity} summary={overall.summary} />

      {/* Diff heatmap (comparison mode only) */}
      {heatmap && <DiffHeatmap b64={heatmap} />}
    </div>
  );
}
