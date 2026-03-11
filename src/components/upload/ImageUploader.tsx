'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import {
  MAX_UPLOAD_SIZE_BYTES,
  ACCEPTED_IMAGE_TYPES,
} from '@/lib/utils/constants';

interface ImageUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function ImageUploader({
  onFileSelect,
  disabled = false,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging]     = useState(false);
  const [preview, setPreview]           = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError]               = useState<string | null>(null);

  function validateFile(file: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as typeof ACCEPTED_IMAGE_TYPES[number])) {
      return `Unsupported format. Use JPEG, PNG, WebP or GIF.`;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`;
    }
    return null;
  }

  function processFile(file: File) {
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setError(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    onFileSelect(file);
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="w-full space-y-2">
      <AnimatePresence mode="wait">
        {!preview ? (
          /* ── Drop zone ─────────────────────────────────── */
          <motion.label
            key="dropzone"
            htmlFor="image-upload-input"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 transition-all duration-200',
              isDragging && 'drag-active',
              disabled && 'cursor-not-allowed opacity-40',
            )}
            style={{
              borderColor: isDragging ? '#1E8449' : '#30363d',
              background:  isDragging
                ? 'rgba(30,132,73,0.05)'
                : 'rgba(22,27,39,0.6)',
              minHeight: '180px',
            }}
          >
            {/* Icon */}
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200"
              style={{
                background: isDragging
                  ? 'rgba(30,132,73,0.2)'
                  : 'rgba(48,54,61,0.6)',
                border: `1px solid ${isDragging ? 'rgba(30,132,73,0.5)' : '#30363d'}`,
              }}
            >
              <UploadCloud
                size={24}
                style={{ color: isDragging ? '#3fb950' : '#8b949e' }}
              />
            </div>

            {/* Text */}
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold" style={{ color: '#e6edf3' }}>
                {isDragging ? 'Drop to upload' : 'Drop image here'}
              </p>
              <p className="text-xs" style={{ color: '#8b949e' }}>
                or{' '}
                <span
                  className="font-medium transition-colors"
                  style={{ color: '#3fb950' }}
                >
                  click to browse
                </span>
              </p>
              <p className="text-xs" style={{ color: '#484f58' }}>
                JPEG · PNG · WebP · GIF &nbsp;·&nbsp; max 10 MB
              </p>
            </div>

            <input
              id="image-upload-input"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              disabled={disabled}
            />
          </motion.label>
        ) : (
          /* ── Preview ──────────────────────────────────────── */
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-xl"
            style={{ border: '1px solid #30363d', background: '#161b27' }}
          >
            {/* Success tag */}
            <div
              className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}
            >
              <CheckCircle2 size={11} />
              Ready
            </div>

            {/* Image preview */}
            <div className="relative h-44 w-full">
              <Image
                src={preview}
                alt="Selected image preview"
                fill
                className="object-contain p-3"
                unoptimized
              />
            </div>

            {/* File info */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid #30363d', background: 'rgba(13,17,23,0.5)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ background: 'rgba(30,132,73,0.15)', border: '1px solid rgba(30,132,73,0.3)' }}
                >
                  <ImageIcon size={11} style={{ color: '#3fb950' }} />
                </div>
                <span
                  className="truncate text-xs font-medium"
                  style={{ color: '#e6edf3' }}
                  title={selectedFile?.name}
                >
                  {selectedFile?.name}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs"
                  style={{ background: '#21262d', color: '#8b949e' }}
                >
                  {(selectedFile!.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                onClick={clearFile}
                type="button"
                aria-label="Remove file"
                className="ml-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: '#8b949e' }}
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
            style={{
              background: 'rgba(248,81,73,0.08)',
              border:     '1px solid rgba(248,81,73,0.25)',
              color:      '#f85149',
            }}
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
