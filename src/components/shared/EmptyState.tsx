'use client';

import { GitFork } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
  className?: string;
}

const FEATURES = [
  { icon: '🔍', label: 'pHash comparison' },
  { icon: '🛡️', label: 'ELA forensics' },
  { icon: '🌐', label: 'Web provenance' },
  { icon: '🧬', label: 'CLIP embeddings' },
];

export default function EmptyState({ className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center gap-6 p-8 text-center select-none',
        className
      )}
    >
      {/* Radial glow behind icon */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(30,132,73,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Icon */}
      <div className="relative">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{
            background: 'rgba(22,27,39,0.9)',
            border: '1px solid #30363d',
            boxShadow: '0 0 0 1px rgba(30,132,73,0.15) inset, 0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <GitFork size={32} style={{ color: '#3fb950', opacity: 0.8 }} />
        </div>
        {/* Orbit dot */}
        <span
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full"
          style={{
            background: '#3fb950',
            boxShadow: '0 0 8px #3fb950',
            animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />
      </div>

      {/* Text */}
      <div className="relative space-y-2">
        <h3 className="text-base font-semibold" style={{ color: '#e6edf3' }}>
          Trace an image&apos;s journey
        </h3>
        <p className="mx-auto max-w-[260px] text-sm leading-relaxed" style={{ color: '#8b949e' }}>
          Submit any image to discover its origin, detect edits, and map how it spread across the web.
        </p>
      </div>

      {/* Feature chips */}
      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {FEATURES.map(({ icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
            style={{
              background: '#161b27',
              border: '1px solid #30363d',
              color: '#8b949e',
            }}
          >
            <span>{icon}</span>
            {label}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div
        className="relative h-px w-32 rounded"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(30,132,73,0.4), transparent)',
        }}
      />

      <p className="relative text-xs" style={{ color: '#484f58' }}>
        JPEG · PNG · WebP · GIF · max 10 MB · or any public URL
      </p>
    </div>
  );
}
