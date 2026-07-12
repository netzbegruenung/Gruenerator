import {
  CHART_COLORS,
  CHART_GROUP_LABELS,
  CHART_GROUP_ORDER,
  CHART_TYPE_DEFS,
  type ChartType,
} from '../../utils/chartUtils';
import { cn } from '../../utils/cn';

import type { ReactNode } from 'react';

export interface DiagrammeSectionProps {
  onAddChart: (chartType: ChartType) => void;
}

const C0 = CHART_COLORS[0];
const C1 = CHART_COLORS[1];
const C2 = CHART_COLORS[2];

/**
 * Static mini-chart glyphs (literal brand colors, no live Recharts) — one per
 * ChartType, exhaustively keyed so adding a type without a preview is a
 * compile error.
 */
const CHART_PREVIEWS: { readonly [K in ChartType]: () => ReactNode } = {
  bar: () => (
    <>
      <rect x="8" y="20" width="9" height="22" rx="1.5" fill={C0} />
      <rect x="21" y="10" width="9" height="32" rx="1.5" fill={C1} />
      <rect x="34" y="26" width="9" height="16" rx="1.5" fill={C2} />
      <rect x="47" y="16" width="9" height="26" rx="1.5" fill={C0} />
    </>
  ),
  'bar-horizontal': () => (
    <>
      <rect x="8" y="8" width="40" height="7" rx="1.5" fill={C0} />
      <rect x="8" y="18" width="48" height="7" rx="1.5" fill={C1} />
      <rect x="8" y="28" width="26" height="7" rx="1.5" fill={C2} />
      <rect x="8" y="38" width="34" height="7" rx="1.5" fill={C0} />
    </>
  ),
  line: () => (
    <>
      <polyline
        points="8,38 22,26 36,30 56,10"
        fill="none"
        stroke={C0}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [8, 38],
        [22, 26],
        [36, 30],
        [56, 10],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill={C0} />
      ))}
    </>
  ),
  area: () => (
    <>
      <path d="M8 38 L22 26 L36 30 L56 10 L56 44 L8 44 Z" fill={C0} fillOpacity="0.3" />
      <polyline
        points="8,38 22,26 36,30 56,10"
        fill="none"
        stroke={C0}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  pie: () => (
    <>
      <circle cx="32" cy="24" r="18" fill={C0} />
      <path d="M32 24 L32 6 A18 18 0 0 1 47.6 33 Z" fill={C1} />
      <path d="M32 24 L47.6 33 A18 18 0 0 1 25.8 40.9 Z" fill={C2} />
    </>
  ),
  donut: () => (
    <g transform="rotate(-90 32 24)">
      <circle cx="32" cy="24" r="14" fill="none" stroke={C0} strokeWidth="8" />
      <circle
        cx="32"
        cy="24"
        r="14"
        fill="none"
        stroke={C1}
        strokeWidth="8"
        strokeDasharray="35 53"
      />
      <circle
        cx="32"
        cy="24"
        r="14"
        fill="none"
        stroke={C2}
        strokeWidth="8"
        strokeDasharray="20 68"
        strokeDashoffset="-35"
      />
    </g>
  ),
};

export function ChartTypePreview({ type, size = 48 }: { type: ChartType; size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 64 48" fill="none" aria-hidden>
      {CHART_PREVIEWS[type]()}
    </svg>
  );
}

function ChartCard({
  type,
  name,
  onClick,
}: {
  type: ChartType;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name} einfügen`}
      className="group flex flex-col items-center gap-1.5 cursor-pointer bg-transparent border-none p-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
    >
      <span
        className={cn(
          'flex items-center justify-center w-full aspect-[4/3] rounded-xl',
          'bg-[var(--editor-tile)] border border-[var(--editor-border)]',
          'transition-[background-color,border-color] duration-200 ease-out',
          'group-hover:border-[var(--editor-accent)] group-hover:bg-[var(--editor-active-soft)]'
        )}
      >
        <ChartTypePreview type={type} size={56} />
      </span>
      <span className="text-xs text-[var(--editor-text)] text-center leading-tight truncate max-w-full">
        {name}
      </span>
    </button>
  );
}

export function DiagrammeSection({ onAddChart }: DiagrammeSectionProps) {
  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {CHART_GROUP_ORDER.map((group) => {
        const defs = CHART_TYPE_DEFS.filter((d) => d.group === group);
        if (defs.length === 0) return null;
        return (
          <div key={group}>
            <h5 className="text-sm font-bold text-[var(--editor-text)] m-0 mb-2">
              {CHART_GROUP_LABELS[group]}
            </h5>
            <div className="grid grid-cols-2 gap-2 w-full">
              {defs.map((def) => (
                <ChartCard
                  key={def.id}
                  type={def.id}
                  name={def.name}
                  onClick={() => onAddChart(def.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
