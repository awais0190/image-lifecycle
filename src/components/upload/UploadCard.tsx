'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Globe } from 'lucide-react';
import ImageUploader from './ImageUploader';
import UrlInput from './UrlInput';
import { cn } from '@/lib/utils/cn';

type Tab = 'file' | 'url';

interface UploadCardProps {
  onFileSelect: (file: File) => void;
  onUrlSubmit:  (url: string) => void;
  disabled?:    boolean;
  isLoading?:   boolean;
}

export default function UploadCard({
  onFileSelect,
  onUrlSubmit,
  disabled  = false,
  isLoading = false,
}: UploadCardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('file');

  const tabs: { id: Tab; label: string; icon: typeof HardDrive }[] = [
    { id: 'file', label: 'File Upload', icon: HardDrive },
    { id: 'url',  label: 'URL',         icon: Globe },
  ];

  return (
    <div
      className="w-full overflow-hidden rounded-xl"
      style={{ background: '#161b27', border: '1px solid #30363d' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>
            Submit Image
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: '#8b949e' }}>
            Upload a file or paste a URL to trace its lineage
          </p>
        </div>
       
      </div>

      {/* Tab switcher */}
      <div className="px-5 pt-4">
        <div
          className="flex gap-1 rounded-lg p-1"
          style={{ background: '#0d1117' }}
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all duration-150',
                )}
                style={{
                  color:      isActive ? '#e6edf3' : '#8b949e',
                  background: isActive ? '#161b27' : 'transparent',
                  border:     isActive ? '1px solid #30363d' : '1px solid transparent',
                  boxShadow:  isActive ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                <Icon size={12} className="shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {activeTab === 'file' ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <ImageUploader
                onFileSelect={onFileSelect}
                disabled={disabled || isLoading}
              />
            </motion.div>
          ) : (
            <motion.div
              key="url"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              <UrlInput
                onUrlSubmit={onUrlSubmit}
                disabled={disabled}
                isLoading={isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
