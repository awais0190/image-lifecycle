'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, AlertCircle, ArrowRight } from 'lucide-react';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils/cn';

interface UrlInputProps {
  onUrlSubmit: (url: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

function isValidUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export default function UrlInput({
  onUrlSubmit,
  disabled  = false,
  isLoading = false,
}: UrlInputProps) {
  const [value,   setValue]   = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) { setError('Please enter a URL.'); return; }
    if (!isValidUrl(trimmed)) { setError('Enter a valid https:// URL.'); return; }
    setError(null);
    onUrlSubmit(trimmed);
  }

  const isDisabled = disabled || isLoading;
  const canSubmit  = !isDisabled && value.trim().length > 0;

  return (
    <motion.form
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onSubmit={handleSubmit}
      className="w-full space-y-3"
    >
      {/* Input + button: stacked on mobile, row on sm+ */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {/* URL field */}
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 transition-all duration-150"
          style={{
            background: '#21262d',
            border:     `1px solid ${focused ? '#1E8449' : '#30363d'}`,
            boxShadow:  focused ? '0 0 0 3px rgba(30,132,73,0.12)' : 'none',
          }}
        >
          <Link2
            size={14}
            className="shrink-0"
            style={{ color: focused ? '#3fb950' : '#8b949e' }}
          />
          <input
            type="url"
            placeholder="https://example.com/image.jpg"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onFocus={() => setFocused(true)}
            onBlur={()  => setFocused(false)}
            disabled={isDisabled}
            className={cn(
              'min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none',
              isDisabled && 'cursor-not-allowed opacity-50',
            )}
            style={{ color: '#e6edf3' }}
            aria-label="Image URL"
            autoComplete="off"
            spellCheck={false}
          />
          {value && !isDisabled && (
            <button
              type="button"
              onClick={() => { setValue(''); setError(null); }}
              className="shrink-0 rounded px-1 text-sm leading-none transition-colors hover:text-white"
              style={{ color: '#484f58' }}
              aria-label="Clear URL"
            >
              ×
            </button>
          )}
        </div>

        {/* Submit — full width on mobile, auto on sm+ */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold',
            'transition-all duration-150 sm:w-auto sm:shrink-0',
            canSubmit ? 'hover:brightness-110 active:scale-[0.98]' : 'cursor-not-allowed opacity-40',
          )}
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg, #1E8449, #27ae60)'
              : '#21262d',
            color:  '#ffffff',
            border: '1px solid rgba(30,132,73,0.4)',
          }}
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <span>Analyze</span>
              <ArrowRight size={14} className="shrink-0" />
            </>
          )}
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: '#f85149' }}
          >
            <AlertCircle size={12} className="shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {!error && (
        <p className="text-xs" style={{ color: '#484f58' }}>
          Paste any publicly accessible image URL (JPG, PNG, WebP, GIF)
        </p>
      )}
    </motion.form>
  );
}
