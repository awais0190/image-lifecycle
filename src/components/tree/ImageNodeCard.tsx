'use client';

/**
 * ImageNodeCard — React Flow custom node component.
 * Adds an ELA score dot (red/amber/green) on the bottom-right of the card.
 */

import { memo }                        from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion }                      from 'framer-motion';
import StatusBadge                     from '@/components/shared/StatusBadge';
import type { TreeJSON }               from '@/types/image';
import { STATUS_COLORS, ELA_THRESHOLDS } from '@/lib/utils/constants';
import type { NodeStatusValue }        from '@/lib/utils/constants';

export type ImageNodeData = TreeJSON & { selected?: boolean };

const CARD_W = 180;
const CARD_H = 115;

/** Small colored dot showing ELA likelihood */
function ElaDot({ elaScore }: { elaScore: number }) {
  const color =
    elaScore > ELA_THRESHOLDS.LIKELY_EDITED   ? '#f85149'   // red — likely edited
    : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? '#d29922' // amber — possibly edited
    : elaScore > 0                              ? '#3fb950'  // green — authentic
    : '#484f58';                                             // grey — no ELA data

  const title =
    elaScore > ELA_THRESHOLDS.LIKELY_EDITED   ? `ELA: ${elaScore.toFixed(3)} — likely edited`
    : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? `ELA: ${elaScore.toFixed(3)} — possibly edited`
    : elaScore > 0                              ? `ELA: ${elaScore.toFixed(3)} — likely authentic`
    : 'ELA: no data';

  return (
    <div
      title={title}
      style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/** Small row of emoji indicators for detected edit types */
function EditTypeIcons({ editTypes }: { editTypes: string[] }) {
  if (!editTypes.length) return null;
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
      {editTypes.includes('color_change') && (
        <span title="Color filter / colour change detected" style={{ fontSize: 9 }}>🎨</span>
      )}
      {editTypes.includes('object_change') && (
        <span title="Objects added or removed" style={{ fontSize: 9 }}>🔍</span>
      )}
    </div>
  );
}

function ImageNodeCardInner({ data, selected }: NodeProps & { data: ImageNodeData }) {
  const statusColor = STATUS_COLORS[data.status as NodeStatusValue] ?? '#8b949e';
  const platform    = data.sources?.[0]?.platform ?? 'Uploaded';
  const borderColor = selected ? statusColor : '#30363d';
  const glowShadow  = selected ? `0 0 0 2px ${statusColor}55, 0 4px 20px ${statusColor}33` : 'none';
  const elaScore    = data.forensics?.elaScore ?? 0;
  const editTypes   = data.forensics?.editReport?.overall?.edit_types ?? [];

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: statusColor, border: 'none', width: 8, height: 8 }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          width:        CARD_W,
          minHeight:    CARD_H,
          background:   '#161b27',
          border:       `1.5px solid ${borderColor}`,
          borderRadius: 10,
          boxShadow:    glowShadow,
          overflow:     'hidden',
          cursor:       'pointer',
          userSelect:   'none',
        }}
      >
        {/* Status bar at top */}
        <div style={{ height: 3, background: statusColor, width: '100%' }} />

        {/* Thumbnail */}
        <div style={{ padding: '8px 8px 0' }}>
          {data.cloudinaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.cloudinaryUrl}
              alt="Node thumbnail"
              width={CARD_W - 16}
              height={54}
              style={{ width: '100%', height: 54, objectFit: 'cover', borderRadius: 6, background: '#0d1117' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div style={{
              width: '100%', height: 54, borderRadius: 6,
              background: '#0d1117', border: '1px solid #30363d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 20 }}>🖼</span>
            </div>
          )}
        </div>

        {/* Info row */}
        <div style={{ padding: '6px 8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <StatusBadge status={data.status as NodeStatusValue} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ElaDot elaScore={elaScore} />
              <span style={{ fontSize: 10, color: '#484f58' }}>L{data.depth}</span>
            </div>
          </div>
          <p style={{ fontSize: 10, color: '#8b949e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {platform}
          </p>
          <p style={{ fontSize: 9, color: '#484f58', margin: '2px 0 0', fontFamily: 'monospace' }}>
            {data.hash.slice(0, 12)}…
          </p>
          <EditTypeIcons editTypes={editTypes} />
        </div>
      </motion.div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: statusColor, border: 'none', width: 8, height: 8 }}
      />
    </>
  );
}

export const ImageNodeCard = memo(ImageNodeCardInner);
export default ImageNodeCard;
