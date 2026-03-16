'use client';

/**
 * EditSignalsPanel — Phase 04
 * Displays all edit-detection signals with animated confidence bars.
 */

import { motion }    from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, AlertTriangle,
  FileImage, ScanLine, Cpu, Eye,
} from 'lucide-react';
import type { EditAssessment, EditSignal } from '@/types/image';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function verdictConfig(verdict: EditAssessment['verdict']) {
  switch (verdict) {
    case 'edited':
      return {
        icon:    <ShieldAlert size={15} style={{ color: '#f85149' }} />,
        label:   'Likely Edited',
        color:   '#f85149',
        bg:      'rgba(248,81,73,0.08)',
        border:  '#f8514933',
      };
    case 'uncertain':
      return {
        icon:    <AlertTriangle size={15} style={{ color: '#d29922' }} />,
        label:   'Uncertain',
        color:   '#d29922',
        bg:      'rgba(210,153,34,0.08)',
        border:  '#d2992233',
      };
    default:
      return {
        icon:    <ShieldCheck size={15} style={{ color: '#3fb950' }} />,
        label:   'Likely Original',
        color:   '#3fb950',
        bg:      'rgba(63,185,80,0.08)',
        border:  '#3fb95033',
      };
  }
}

function barColor(score: number): string {
  if (score >= 0.65) return '#f85149';
  if (score >= 0.35) return '#d29922';
  return '#3fb950';
}

// ─── Signal row ──────────────────────────────────────────────────────────────

function SignalRow({
  icon,
  name,
  signal,
}: {
  icon:   React.ReactNode;
  name:   string;
  signal: EditSignal;
}) {
  const pct   = Math.round(signal.score * 100);
  const color = barColor(signal.score);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ color: '#484f58' }}>{icon}</span>
          <span className="text-xs font-medium" style={{ color: '#8b949e' }}>{name}</span>
        </div>
        <span className="font-mono text-xs font-semibold" style={{ color }}>
          {pct}%
        </span>
      </div>

      {/* Bar track */}
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: '#30363d' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>

      <p className="text-xs leading-tight" style={{ color: '#484f58' }}>
        {signal.reason}
      </p>
    </div>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface EditSignalsPanelProps {
  assessment: EditAssessment;
}

export default function EditSignalsPanel({ assessment }: EditSignalsPanelProps) {
  const { verdict, editProbability, overallConfidence, signals } = assessment;
  const vc = verdictConfig(verdict);

  return (
    <div className="space-y-3">
      {/* Verdict banner */}
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2.5"
        style={{ background: vc.bg, border: `1px solid ${vc.border}` }}
      >
        <div className="flex items-center gap-2">
          {vc.icon}
          <span className="text-sm font-semibold" style={{ color: vc.color }}>
            {vc.label}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono font-bold" style={{ color: vc.color }}>
            {Math.round(editProbability * 100)}%
          </p>
          <p className="text-xs" style={{ color: '#484f58' }}>edit prob.</p>
        </div>
      </div>

      {/* Confidence row */}
      <div className="flex items-center justify-between text-xs" style={{ color: '#484f58' }}>
        <span>Signal confidence</span>
        <span className="font-mono" style={{ color: '#8b949e' }}>
          {Math.round(overallConfidence * 100)}%
        </span>
      </div>

      {/* Signal breakdown */}
      <div className="space-y-3 rounded-lg px-3 py-3" style={{ background: '#1c2333', border: '1px solid #30363d' }}>
        <SignalRow
          icon={<FileImage size={11} />}
          name="EXIF Metadata"
          signal={signals.exif}
        />
        <div style={{ borderTop: '1px solid #30363d' }} />
        <SignalRow
          icon={<ScanLine size={11} />}
          name="ELA Analysis"
          signal={signals.ela}
        />
        {signals.clip && (
          <>
            <div style={{ borderTop: '1px solid #30363d' }} />
            <SignalRow
              icon={<Cpu size={11} />}
              name="CLIP / Structural"
              signal={signals.clip}
            />
          </>
        )}
        {signals.visual && (
          <>
            <div style={{ borderTop: '1px solid #30363d' }} />
            <SignalRow
              icon={<Eye size={11} />}
              name="Visual Analysis"
              signal={signals.visual}
            />
          </>
        )}
      </div>
    </div>
  );
}
