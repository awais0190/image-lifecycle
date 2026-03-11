'use client';

/**
 * MetadataTable — STUB
 *
 * TODO Phase 02:
 *   1. Receive ImageMetadata object as prop
 *   2. Render a two-column table: field name / value
 *   3. Highlight suspicious values (missing GPS, future dates, zeroed fields)
 *   4. Add copy-to-clipboard for raw EXIF JSON
 *   5. Collapsible GPS section with mini map embed (Phase 04)
 */

import type { ImageMetadata } from '@/types/image';
import { cn } from '@/lib/utils/cn';

interface MetadataTableProps {
  metadata?: ImageMetadata | null;
  className?: string;
}

export default function MetadataTable({ metadata, className }: MetadataTableProps) {
  if (!metadata) {
    return (
      <div
        className={cn('rounded-xl p-4', className)}
        style={{ background: '#16213e', border: '1px solid #2d3748' }}
      >
        <p className="text-xs" style={{ color: '#8892a4' }}>
          No metadata available.
        </p>
      </div>
    );
  }

  const rows: { label: string; value: string | undefined }[] = [
    { label: 'Dimensions', value: `${metadata.width} × ${metadata.height}` },
    { label: 'Format',     value: metadata.format },
    { label: 'File Size',  value: `${(metadata.fileSize / 1024).toFixed(1)} KB` },
    { label: 'Created',    value: metadata.dateCreated },
    { label: 'Camera',     value: metadata.camera },
    { label: 'Software',   value: metadata.software },
    { label: 'GPS',        value: metadata.gps
        ? `${metadata.gps.lat.toFixed(5)}, ${metadata.gps.lng.toFixed(5)}`
        : undefined },
  ];

  return (
    <div
      className={cn('w-full rounded-xl overflow-hidden', className)}
      style={{ background: '#16213e', border: '1px solid #2d3748' }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #2d3748' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8892a4' }}>
          EXIF Metadata
        </h3>
      </div>

      <table className="w-full text-xs">
        <tbody>
          {rows.map(({ label, value }) =>
            value ? (
              <tr
                key={label}
                className="border-b last:border-0"
                style={{ borderColor: '#2d3748' }}
              >
                <td className="py-2 pl-4 pr-2 font-medium" style={{ color: '#8892a4', width: '40%' }}>
                  {label}
                </td>
                <td className="py-2 pl-2 pr-4" style={{ color: '#ffffff' }}>
                  {value}
                </td>
              </tr>
            ) : null
          )}
        </tbody>
      </table>
    </div>
  );
}
