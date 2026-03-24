'use client';

/**
 * MetadataTable
 * Dark two-column table with alternating row shading, Framer Motion stagger,
 * optional monospace font, and muted placeholder for null values.
 */

import { motion } from 'framer-motion';
import { MapPin }  from 'lucide-react';
import { cn }      from '@/lib/utils/cn';

export interface MetadataRow {
  label: string;
  value: string | null | undefined;
  /** 'pin' renders a MapPin icon before the value */
  icon?: 'pin';
  /** Render value in monospace font */
  mono?: boolean;
}

interface MetadataTableProps {
  rows: MetadataRow[];
  className?: string;
}

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -6 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

export default function MetadataTable({ rows, className }: MetadataTableProps) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-lg', className)}
      style={{ border: '1px solid #30363d' }}
    >
      <motion.table
        className="w-full text-xs"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <tbody>
          {rows.map(({ label, value, icon, mono }, i) => (
            <motion.tr
              key={label}
              variants={rowVariants}
              className="border-b last:border-0"
              style={{
                borderColor: '#30363d',
                background:  i % 2 === 0 ? '#1c2333' : '#161b27',
              }}
            >
              <td
                className="py-2 pl-3 pr-2 font-medium"
                style={{ color: '#8b949e', width: '38%', whiteSpace: 'nowrap' }}
              >
                {label}
              </td>
              <td className="py-2 pl-2 pr-3">
                {value ? (
                  <span
                    className={cn('flex items-center gap-1', mono && 'font-mono')}
                    style={{ color: '#e6edf3' }}
                  >
                    {icon === 'pin' && (
                      <MapPin size={10} style={{ color: '#3fb950', flexShrink: 0 }} />
                    )}
                    {value}
                  </span>
                ) : (
                  <span style={{ color: '#484f58' }}>Not available</span>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </motion.table>
    </div>
  );
}
