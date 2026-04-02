'use client';

/**
 * ELAViewer
 * Side-by-side original vs ELA heatmap comparison with score display.
 */

import { useState }  from 'react';
import { motion }    from 'framer-motion';
import { Info }      from 'lucide-react';
import { ELA_THRESHOLDS } from '@/lib/utils/constants';

interface ELAViewerProps {
  originalUrl:    string;
  heatmapUrl:     string | null;
  elaScore:       number;
  isLikelyEdited: boolean;
}

function elaScoreColor(score: number): string {
  if (score > ELA_THRESHOLDS.LIKELY_EDITED)   return '#f85149'; // red
  if (score > ELA_THRESHOLDS.POSSIBLY_EDITED) return '#d29922'; // amber
  return '#3fb950';                                              // green
}

export default function ELAViewer({
  originalUrl,
  heatmapUrl,
  elaScore,
  isLikelyEdited,
}: ELAViewerProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const scoreColor = elaScoreColor(elaScore);
  const scoreLabel =
    elaScore > ELA_THRESHOLDS.LIKELY_EDITED   ? 'Likely Edited'
    : elaScore > ELA_THRESHOLDS.POSSIBLY_EDITED ? 'Possibly Edited'
    : 'Likely Authentic';

  return (
    <div className="space-y-3">
      {/* Score row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-bold font-mono" style={{ color: scoreColor }}>
            {elaScore.toFixed(3)}
          </span>
          <div className="space-y-0">
            <p className="text-xs font-semibold" style={{ color: scoreColor }}>{scoreLabel}</p>
            <p className="text-xs" style={{ color: '#484f58' }}>ELA Score</p>
          </div>
        </div>

        {/* Info tooltip */}
        <div className="relative">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="flex h-5 w-5 items-center justify-center rounded-full transition-colors"
            style={{ color: '#484f58', background: '#1c2333', border: '1px solid #30363d' }}
          >
            <Info size={11} />
          </button>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-7 z-20 w-60 rounded-lg px-3 py-2.5 text-xs"
              style={{ background: '#161b27', border: '1px solid #30363d', color: '#8b949e' }}
            >
              Error Level Analysis re-compresses the image and highlights regions that show
              unusual compression patterns, which can indicate digital editing.
              Higher values = more evidence of editing.
            </motion.div>
          )}
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-xs" style={{ color: '#484f58' }}>
        Higher score = more likely edited · Threshold: 0.15
      </p>

      {/* Side-by-side images */}
      <div className="grid grid-cols-2 gap-2">
        {/* Original */}
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalUrl}
            alt="Original"
            className="w-full rounded-lg object-cover"
            style={{ height: 120, background: '#0d1117', border: '1px solid #30363d' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <p className="text-center text-xs" style={{ color: '#484f58' }}>Original</p>
        </div>

        {/* ELA heatmap */}
        <div className="space-y-1">
          {heatmapUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heatmapUrl}
              alt="ELA Heatmap"
              className="w-full rounded-lg object-cover"
              style={{
                height: 120, background: '#0d1117',
                border: `1px solid ${isLikelyEdited ? '#f8514933' : '#30363d'}`,
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="flex w-full items-center justify-center rounded-lg text-xs"
              style={{ height: 120, background: '#0d1117', border: '1px solid #30363d', color: '#484f58' }}
            >
              ELA unavailable
            </div>
          )}
          <p className="text-center text-xs" style={{ color: '#484f58' }}>ELA Analysis</p>
        </div>
      </div>

      {/* Color legend */}
      <div
        className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs"
        style={{ background: '#1c2333', border: '1px solid #30363d' }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: 'linear-gradient(90deg, #111 0%, #f85149 100%)' }}
          />
          <span style={{ color: '#484f58' }}>Dark = Authentic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: '#484f58' }}>Bright/Red = Edited</span>
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: 'linear-gradient(90deg, #f8514966 0%, #f85149 100%)' }}
          />
        </div>
      </div>
    </div>
  );
}
