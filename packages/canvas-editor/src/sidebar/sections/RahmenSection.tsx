import { useMemo } from 'react';

import {
  FRAME_CATEGORY_LABELS,
  FRAME_CATEGORY_ORDER,
  FRAME_PRESET_PATHS,
  FRAME_PRESETS,
  getFramePreset,
} from '../../utils/frameUtils';
import { cn } from '../../utils/cn';
import { SELECTABLE_CARD, SIDEBAR_SECTION } from '../sidebarStyles';

import type {
  FrameCategory,
  FrameClipType,
  FrameInstance,
  FramePreset,
} from '../../utils/frameUtils';

const PREVIEW_GRADIENT_ID = 'rahmen-preset-preview-gradient';

export interface RahmenSectionProps {
  onAddFrame: (clipType: FrameClipType) => void;
  searchQuery?: string;
  // Kept for prop-shape compatibility with featureInjector (selected-frame
  // editing now lives in FrameSettingsSection, but configs still inject these).
  selectedFrame?: FrameInstance | null;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
  onUpdateFrame?: (id: string, partial: Partial<FrameInstance>) => void;
  onRemoveFrame?: (id: string) => void;
}

/**
 * Index of frame presets grouped by category. Computed once at module load via
 * the typed getFramePreset accessor — adding a new FrameClipType automatically
 * shows up under its category subheader without touching this file.
 */
const FRAMES_BY_CATEGORY: Record<FrameCategory, ReadonlyArray<FramePreset>> = (() => {
  const acc = {} as Record<FrameCategory, FramePreset[]>;
  for (const cat of FRAME_CATEGORY_ORDER) acc[cat] = [];
  for (const preset of FRAME_PRESETS) {
    const def = getFramePreset(preset.id);
    acc[def.category].push(preset);
  }
  return acc;
})();

function presetMatchesQuery(preset: FramePreset, q: string): boolean {
  return (
    preset.name.toLowerCase().includes(q) ||
    preset.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

export function RahmenSection({ onAddFrame, searchQuery = '' }: RahmenSectionProps) {
  const q = searchQuery.trim().toLowerCase();

  const groupedFrames = useMemo(() => {
    const groups: { category: FrameCategory; presets: ReadonlyArray<FramePreset> }[] = [];
    for (const cat of FRAME_CATEGORY_ORDER) {
      const all = FRAMES_BY_CATEGORY[cat];
      const filtered = q ? all.filter((p) => presetMatchesQuery(p, q)) : all;
      if (filtered.length > 0) groups.push({ category: cat, presets: filtered });
    }
    return groups;
  }, [q]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md')}>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={PREVIEW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>

      {groupedFrames.map(({ category, presets }) => (
        <section key={category} className="flex flex-col gap-2">
          <h5 className="text-sm font-bold text-foreground m-0">
            {FRAME_CATEGORY_LABELS[category]}
          </h5>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2 w-full text-secondary-600 dark:text-secondary-300">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={cn(SELECTABLE_CARD, 'flex-col gap-1')}
                onClick={() => onAddFrame(preset.id)}
                title={`${preset.name} hinzufügen`}
                type="button"
              >
                <FramePresetPreview clipType={preset.id} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FramePresetPreview({ clipType }: { clipType: FrameClipType }) {
  const path = FRAME_PRESET_PATHS[clipType];
  const clipId = `frame-preset-clip-${clipType}`;
  // Ring is the only annular preset; render its two subpaths with even-odd
  // fill so the hole shows through the gradient miniature.
  const isAnnular = clipType === 'ring';
  const evenOddProps = isAnnular ? { clipRule: 'evenodd' as const } : {};
  const fillRuleProps = isAnnular ? { fillRule: 'evenodd' as const } : {};
  return (
    <svg viewBox="0 0 44 44" className="size-11">
      <defs>
        <clipPath id={clipId} {...evenOddProps}>
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="44" height="44" fill={`url(#${PREVIEW_GRADIENT_ID})`} />
        <path
          d="M0 36 L12 22 L20 30 L28 18 L36 28 L44 24 L44 44 L0 44 z"
          fill="#15803d"
          opacity={0.55}
        />
        <circle cx="33" cy="13" r="3" fill="#fde68a" />
      </g>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={1.25}
        {...fillRuleProps}
      />
    </svg>
  );
}
