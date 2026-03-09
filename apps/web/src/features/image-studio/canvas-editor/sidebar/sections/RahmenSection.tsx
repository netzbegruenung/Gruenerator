import { useCallback, useMemo, useRef } from 'react';
import { PiFrameCornersFill, PiTrashFill } from 'react-icons/pi';

import { FRAME_PRESETS } from '../../utils/frameUtils';
import { SIDEBAR_SECTION, CARD_GRID, SELECTABLE_CARD } from '../primitives';

import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';

import { cn } from '@/utils/cn';

export interface RahmenSectionProps {
  onAddFrame: (clipType: FrameClipType) => void;
  selectedFrame: FrameInstance | null;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
  onRemoveFrame?: (id: string) => void;
  searchQuery?: string;
}

export function RahmenSection({
  onAddFrame,
  selectedFrame,
  onSetFrameImage,
  onRemoveFrame,
  searchQuery = '',
}: RahmenSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visiblePresets = useMemo(() => {
    if (!searchQuery.trim()) return FRAME_PRESETS;
    const q = searchQuery.toLowerCase();
    return FRAME_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && selectedFrame && onSetFrameImage) {
        const objectUrl = URL.createObjectURL(file);
        onSetFrameImage(selectedFrame.id, file, objectUrl);
      }
      if (e.target) {
        e.target.value = '';
      }
    },
    [selectedFrame, onSetFrameImage]
  );

  const hasImage = selectedFrame?.imageSrc != null;

  return (
    <div className={SIDEBAR_SECTION}>
      <div className={CARD_GRID}>
        {visiblePresets.map((preset) => (
          <button
            key={preset.id}
            className={SELECTABLE_CARD}
            onClick={() => onAddFrame(preset.id)}
            title={`${preset.name} hinzufuegen`}
            type="button"
          >
            <div className="relative size-11 flex items-center justify-center shrink-0">
              {preset.id === 'circle' ? (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '2px dashed #005538',
                  }}
                />
              ) : (
                <PiFrameCornersFill size={24} />
              )}
            </div>
          </button>
        ))}
      </div>

      {selectedFrame && (
        <div className={cn(SIDEBAR_SECTION, 'mt-3')}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {onSetFrameImage && (
            <button
              type="button"
              className="w-full mb-2 flex items-center justify-center gap-xs py-xs px-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-[var(--card-border-radius-small)] text-foreground-muted text-[length:var(--font-size-small)] cursor-pointer transition-[background-color,border-color,color] duration-150 hover:bg-background-alt hover:border-primary-600 hover:text-primary-600"
              onClick={handleImageClick}
            >
              {hasImage ? 'Bild aendern' : 'Bild hinzufuegen'}
            </button>
          )}
          {onRemoveFrame && (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-xs py-xs px-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-[var(--card-border-radius-small)] text-red-600 text-[length:var(--font-size-small)] cursor-pointer transition-[background-color,border-color,color] duration-150 hover:bg-red-50 hover:border-red-400"
              onClick={() => onRemoveFrame(selectedFrame.id)}
            >
              <PiTrashFill size={14} />
              <span className="ml-1">Rahmen entfernen</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
