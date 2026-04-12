'use client';

/**
 * ImageNodeCard — React Flow custom node component.
 * Image fills the card edge-to-edge; info strip sits at the bottom.
 */

import { memo }                             from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion }                           from 'framer-motion';
import StatusBadge                          from '@/components/shared/StatusBadge';
import type { TreeJSON }                    from '@/types/image';
import { STATUS_COLORS, ELA_THRESHOLDS }    from '@/lib/utils/constants';
import type { NodeStatusValue }             from '@/lib/utils/constants';

export type ImageNodeData = TreeJSON & { selected?: boolean };

const CARD_W = 300;
const CARD_H = 520;
const IMG_H  = 450;

/** Colored dot — ELA authenticity indicator */
function ElaDot({ elaScore }: { elaScore: number }) {
  const color =
    elaScore > ELA_THRESHOLDS.LIKELY_EDITED    ? '#f85149'
    : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? '#d29922'
    : elaScore > 0                              ? '#3fb950'
    : '#484f58';

  const label =
    elaScore > ELA_THRESHOLDS.LIKELY_EDITED    ? `ELA ${elaScore.toFixed(3)} — likely edited`
    : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? `ELA ${elaScore.toFixed(3)} — possibly edited`
    : elaScore > 0                              ? `ELA ${elaScore.toFixed(3)} — authentic`
    : 'ELA: no data';

  return (
    <div
      title={label}
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );
}

function ImageNodeCardInner({ data, selected }: NodeProps & { data: ImageNodeData }) {
  const statusColor = STATUS_COLORS[data.status as NodeStatusValue] ?? '#8b949e';
  const platform    = data.sources?.[0]?.platform ?? 'Uploaded';
  const borderColor = selected ? statusColor : '#30363d';
  const shadow      = selected
    ? `0 0 0 2px ${statusColor}66, 0 8px 24px ${statusColor}22`
    : '0 2px 12px rgba(0,0,0,0.4)';
  const elaScore    = data.forensics?.elaScore ?? 0;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: statusColor, border: 'none', width: 10, height: 10 }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        style={{
          width:        CARD_W,
          minHeight:    CARD_H,
          background:   '#0d1117',
          border:       `2px solid ${borderColor}`,
          borderRadius: 12,
          boxShadow:    shadow,
          overflow:     'clip',
          cursor:       'pointer',
          userSelect:   'none',
          display:      'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Image area — edge-to-edge, full width ── */}
        <div style={{ position: 'relative', width: '100%', height: IMG_H, flexShrink: 0 }}>
          {data.cloudinaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.cloudinaryUrl}
              alt="Node thumbnail"
              style={{
                width:          '100%',
                height:         '100%',
                objectFit:      'cover',
                objectPosition: 'center',
                display:        'block',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: '#161b27',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 32, opacity: 0.4 }}>🖼</span>
            </div>
          )}

          {/* Status colour bar — overlay at top of image */}
          <div style={{
            position:   'absolute',
            top: 0, left: 0, right: 0,
            height:     4,
            background: statusColor,
          }} />

          {/* Depth badge — top-right corner */}
          <div style={{
            position:     'absolute',
            top: 8, right: 8,
            background:   'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            borderRadius: 6,
            padding:      '2px 7px',
            fontSize:     10,
            color:        '#e6edf3',
            fontFamily:   'monospace',
            letterSpacing: '0.04em',
          }}>
            L{data.depth}
          </div>
        </div>

        {/* ── Info strip ── */}
        <div style={{
          padding:        '8px 10px 10px',
          background:     '#161b27',
          borderTop:      '1px solid #21262d',
          display:        'flex',
          flexDirection:  'column',
          gap:            5,
        }}>
          {/* Row 1: status badge + ELA dot */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <StatusBadge status={data.status as NodeStatusValue} />
            <ElaDot elaScore={elaScore} />
          </div>

          {/* Row 2: platform + hash */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {platform}
            </span>
            <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
              {data.hash.slice(0, 10)}…
            </span>
          </div>
        </div>
      </motion.div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: statusColor, border: 'none', width: 10, height: 10 }}
      />
    </>
  );
}

export const ImageNodeCard = memo(ImageNodeCardInner);
export default ImageNodeCard;
