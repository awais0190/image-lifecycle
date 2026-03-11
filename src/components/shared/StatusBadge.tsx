'use client';

import { cn } from '@/lib/utils/cn';
import { STATUS_LABELS } from '@/lib/utils/constants';
import type { NodeStatusValue } from '@/lib/utils/constants';

const BADGE_STYLES: Record<NodeStatusValue, { color: string; bg: string; border: string }> = {
  original:  { color: '#3fb950', bg: 'rgba(63,185,80,0.1)',   border: 'rgba(63,185,80,0.3)'   },
  edited:    { color: '#f85149', bg: 'rgba(248,81,73,0.1)',   border: 'rgba(248,81,73,0.3)'   },
  uncertain: { color: '#d29922', bg: 'rgba(210,153,34,0.1)',  border: 'rgba(210,153,34,0.3)'  },
  duplicate: { color: '#8b949e', bg: 'rgba(139,148,158,0.1)', border: 'rgba(139,148,158,0.3)' },
};

interface StatusBadgeProps {
  status: NodeStatusValue;
  className?: string;
  showDot?: boolean;
}

export default function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const { color, bg, border } = BADGE_STYLES[status];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {showDot && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />}
      {STATUS_LABELS[status]}
    </span>
  );
}
