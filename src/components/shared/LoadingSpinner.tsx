'use client';

import { cn } from '@/lib/utils/cn';

type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, { ring: string; border: string }> = {
  sm: { ring: 'h-4 w-4',   border: 'border-2' },
  md: { ring: 'h-8 w-8',   border: 'border-2' },
  lg: { ring: 'h-12 w-12', border: 'border-[3px]' },
};

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export default function LoadingSpinner({
  size = 'md',
  className,
  label,
}: LoadingSpinnerProps) {
  const { ring, border } = SIZES[size];
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn('animate-spin rounded-full', ring, border)}
        style={{
          borderColor:    'rgba(63,185,80,0.15)',
          borderTopColor: '#3fb950',
        }}
        role="status"
        aria-label={label ?? 'Loading'}
      />
      {label && (
        <p className="text-sm font-medium" style={{ color: '#8b949e' }}>
          {label}
        </p>
      )}
    </div>
  );
}
