'use client';

/**
 * TreeStats
 * Pill-badge bar showing aggregate tree statistics.
 */

import { motion } from 'framer-motion';
import type { TreeStats } from '@/types/image';

interface TreeStatsProps {
  stats: TreeStats;
}

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, scale: 0.85 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.18 } },
};

function Pill({
  label,
  value,
  color = '#484f58',
  bg    = '#1c2333',
}: {
  label: string;
  value: string | number;
  color?: string;
  bg?:    string;
}) {
  return (
    <motion.span
      variants={item}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: bg, border: `1px solid ${color}33`, color }}
    >
      <span style={{ color: '#e6edf3', fontWeight: 600 }}>{value}</span>
      {label}
    </motion.span>
  );
}

export default function TreeStats({ stats }: TreeStatsProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-wrap items-center gap-1.5"
    >
      <Pill label="nodes"       value={stats.totalNodes}    color="#3fb950" bg="rgba(63,185,80,0.08)" />
      {stats.editedCount > 0 && (
        <Pill label="edited"    value={stats.editedCount}   color="#f85149" bg="rgba(248,81,73,0.08)" />
      )}
      {stats.originalCount > 0 && (
        <Pill label="original"  value={stats.originalCount} color="#3fb950" bg="rgba(63,185,80,0.06)" />
      )}
      {stats.maxDepth > 0 && (
        <Pill label="generations" value={stats.maxDepth}    color="#8b949e" bg="#1c2333" />
      )}
      {stats.platforms.slice(0, 4).map((p) => (
        <Pill key={p} label={p} value="•" color="#8b949e" bg="#1c2333" />
      ))}
      {stats.platforms.length > 4 && (
        <Pill label="more platforms" value={`+${stats.platforms.length - 4}`} color="#484f58" bg="#1c2333" />
      )}
    </motion.div>
  );
}
