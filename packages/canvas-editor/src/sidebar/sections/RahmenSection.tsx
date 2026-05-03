import { useMemo } from 'react';

import { FRAME_PRESET_PATHS, FRAME_PRESETS } from '../../utils/frameUtils';
import { cn } from '../../utils/cn';
import { SELECTABLE_CARD, SIDEBAR_SECTION } from '../primitives';

import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';

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

export function RahmenSection({ onAddFrame, searchQuery = '' }: RahmenSectionProps) {
  const visiblePresets = useMemo(() => {
    if (!searchQuery.trim()) return FRAME_PRESETS;
    const q = searchQuery.toLowerCase();
    return FRAME_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-[1rem]')}>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={PREVIEW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2 w-full">
        {visiblePresets.map((preset) => (
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
    </div>
  );
}

function FramePresetPreview({ clipType }: { clipType: FrameClipType }) {
  const path = FRAME_PRESET_PATHS[clipType];
  const clipId = `frame-preset-clip-${clipType}`;
  return (
    <svg viewBox="0 0 44 44" className="size-11">
      <defs>
        <clipPath id={clipId}>
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
      <path d={path} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.25} />
    </svg>
  );
}
