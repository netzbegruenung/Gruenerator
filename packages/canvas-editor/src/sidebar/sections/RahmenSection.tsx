import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaTrash } from 'react-icons/fa';

import { FRAME_PRESET_PATHS, FRAME_PRESETS } from '../../utils/frameUtils';
import { cn } from '../../utils/cn';
import {
  ACTION_BTN_DANGER,
  SECTION_HEADER,
  SECTION_TITLE,
  SELECTABLE_CARD,
  SIDEBAR_SECTION,
} from '../primitives';

import { ImageInputPicker } from './tools/ImageInputPicker';

import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';

const PREVIEW_GRADIENT_ID = 'rahmen-preset-preview-gradient';

export interface RahmenSectionProps {
  onAddFrame: (clipType: FrameClipType) => void;
  selectedFrame: FrameInstance | null;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
  onUpdateFrame?: (id: string, partial: Partial<FrameInstance>) => void;
  onRemoveFrame?: (id: string) => void;
  searchQuery?: string;
}

export function RahmenSection({
  onAddFrame,
  selectedFrame,
  onSetFrameImage,
  onUpdateFrame,
  onRemoveFrame,
  searchQuery = '',
}: RahmenSectionProps) {
  const visiblePresets = useMemo(() => {
    if (!searchQuery.trim()) return FRAME_PRESETS;
    const q = searchQuery.toLowerCase();
    return FRAME_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const [pickerFile, setPickerFile] = useState<File | null>(null);

  // Reset the picker's local file state whenever the selection changes or the
  // frame loses its image (so the dropzone reappears for the new frame).
  useEffect(() => {
    setPickerFile(null);
  }, [selectedFrame?.id, selectedFrame?.imageSrc]);

  const handlePickerChange = useCallback(
    (file: File | null) => {
      setPickerFile(file);
      if (file && selectedFrame && onSetFrameImage) {
        const objectUrl = URL.createObjectURL(file);
        onSetFrameImage(selectedFrame.id, file, objectUrl);
      }
    },
    [selectedFrame, onSetFrameImage]
  );

  const hasImage = selectedFrame?.imageSrc != null;

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-[1rem]')}>
      {/* Shared gradient definition for silhouette previews */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={PREVIEW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>

      {/* Preset grid — silhouettes filled with sample landscape gradient */}
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

      {/* Selected-frame controls */}
      {selectedFrame && (
        <div className="flex flex-col gap-[0.75rem]">
          <div className={cn(SECTION_HEADER, 'max-md:hidden')}>
            <span className={SECTION_TITLE}>Ausgewählter Rahmen</span>
            {onRemoveFrame && (
              <button
                type="button"
                className={ACTION_BTN_DANGER}
                onClick={() => onRemoveFrame(selectedFrame.id)}
                title="Rahmen entfernen"
              >
                <FaTrash size={12} />
              </button>
            )}
          </div>

          {onSetFrameImage && (
            <ImageInputPicker value={pickerFile} onChange={handlePickerChange} />
          )}

          {hasImage && onUpdateFrame && (
            <div className="flex items-center gap-[0.5rem]">
              <span className="text-[0.8125rem] text-grey-600 min-w-[40px] max-md:hidden">
                Zoom
              </span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={selectedFrame.imageScale}
                onChange={(e) =>
                  onUpdateFrame(selectedFrame.id, { imageScale: parseFloat(e.target.value) })
                }
                className="flex-1 h-[4px] appearance-none bg-grey-200 dark:bg-grey-700 rounded-[2px] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:bg-primary-600 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer"
              />
              <span className="text-[0.8125rem] text-grey-600 min-w-[44px] text-right tabular-nums">
                {selectedFrame.imageScale.toFixed(2)}×
              </span>
            </div>
          )}
        </div>
      )}
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
        {/* Tiny mountain silhouette so the gradient reads as a landscape */}
        <path d="M0 36 L12 22 L20 30 L28 18 L36 28 L44 24 L44 44 L0 44 z" fill="#15803d" opacity={0.55} />
        <circle cx="33" cy="13" r="3" fill="#fde68a" />
      </g>
      <path d={path} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.25} />
    </svg>
  );
}
