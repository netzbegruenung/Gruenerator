import * as Slider from '@radix-ui/react-slider';
import React, { useEffect, useRef } from 'react';
import { FaTrash, FaCopy } from 'react-icons/fa';
import {
  Planet,
  Cat,
  Ghost,
  IceCream,
  Browser,
  Mug,
  SpeechBubble,
  Backpack,
  CreditCard,
  File,
  Folder,
  type KawaiiProps,
} from 'react-kawaii';

import Spinner from '../../common/Spinner';
import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { usePaginatedIllustrations } from '../../hooks/usePaginatedIllustrations';
import { getIllustrationPath, getIllustrationThumbPath } from '../../utils/illustrations/registry';
import { onThumbnailHover, onThumbnailLeave } from '../../utils/illustrations/svgCache';
import { ILLUSTRATION_COLORS } from '../../utils/illustrations/types';
import {
  ACTION_BTN,
  ACTION_BTN_DANGER,
  CARD_GRID,
  SELECTABLE_CARD,
  SECTION_HEADER,
  SECTION_TITLE,
  SIDEBAR_SECTION,
} from '../primitives';

import type {
  IllustrationInstance,
  KawaiiMood,
  KawaiiIllustrationType,
  KawaiiInstance,
  SvgDef,
  IllustrationDef,
} from '../../utils/illustrations/types';

import { cn } from '../../utils/cn';

const PREVIEW_COMPONENTS: Record<KawaiiIllustrationType, React.FunctionComponent<KawaiiProps>> = {
  planet: Planet,
  cat: Cat,
  ghost: Ghost,
  iceCream: IceCream,
  browser: Browser,
  mug: Mug,
  speechBubble: SpeechBubble,
  backpack: Backpack,
  creditCard: CreditCard,
  file: File,
  folder: Folder,
};

const MOOD_OPTIONS: { id: KawaiiMood; label: string }[] = [
  { id: 'happy', label: '😊' },
  { id: 'blissful', label: '😌' },
  { id: 'lovestruck', label: '😍' },
  { id: 'shocked', label: '😲' },
  { id: 'sad', label: '😢' },
];

export interface IllustrationenSectionProps {
  onAddIllustration: (id: string) => void;
  selectedIllustration: IllustrationInstance | null;
  onUpdateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  onRemoveIllustration: (id: string) => void;
  onDuplicateIllustration?: (id: string) => void;
  isExpanded?: boolean;
  illustrations?: IllustrationDef[];
}

export function IllustrationenSection({
  onAddIllustration,
  selectedIllustration,
  onUpdateIllustration,
  onRemoveIllustration,
  onDuplicateIllustration,
  isExpanded = false,
  illustrations = [],
}: IllustrationenSectionProps) {
  const { assetBaseUrl = '' } = useCanvasEditorServices();
  const isKawaiiSelected = selectedIllustration?.source === 'kawaii';
  const kawaiiInstance = isKawaiiSelected ? (selectedIllustration as KawaiiInstance) : null;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { visibleIllustrations, hasMore, loadMore } = usePaginatedIllustrations(
    illustrations,
    isExpanded
  );

  // Infinite scroll sentinel observer
  useEffect(() => {
    if (!isExpanded || !hasMore) return;

    const scrollRoot = sentinelRef.current?.closest(
      '.sidebar-panel__content'
    ) as HTMLElement | null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRoot ?? null, rootMargin: '300px', threshold: 0 }
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isExpanded, hasMore, loadMore]);

  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-[var(--spacing-medium)] max-canvas-mobile:!p-0 max-canvas-mobile:!m-0'
      )}
    >
      <div
        className={cn(
          CARD_GRID,
          'grid-cols-[repeat(auto-fill,minmax(64px,1fr))]',
          !isExpanded &&
            'max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-color-[var(--grey-200)_transparent]'
        )}
      >
        {visibleIllustrations.map((illDef) => {
          if (illDef.source === 'kawaii') {
            const PreviewComponent = PREVIEW_COMPONENTS[illDef.id as KawaiiIllustrationType];
            if (!PreviewComponent) return null;
            return (
              <button
                key={illDef.id}
                className={SELECTABLE_CARD}
                onClick={() => onAddIllustration(illDef.id)}
                title={`${illDef.name} hinzufügen`}
              >
                <div className="flex items-center justify-center w-full h-full aspect-square">
                  <PreviewComponent size={40} mood="happy" color="#005437" />
                </div>
              </button>
            );
          }

          const svgDef = illDef as SvgDef;
          return (
            <button
              key={illDef.id}
              className={SELECTABLE_CARD}
              onClick={() => onAddIllustration(illDef.id)}
              onMouseEnter={() => onThumbnailHover(svgDef.id, svgDef)}
              onMouseLeave={() => onThumbnailLeave()}
              title={`${illDef.name} hinzufügen`}
            >
              <div className="flex items-center justify-center w-full h-full aspect-square [&>img]:max-w-full [&>img]:max-h-full [&>img]:object-contain">
                <img
                  src={getIllustrationThumbPath(svgDef, assetBaseUrl)}
                  alt={illDef.name}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = '1';
                      img.src = getIllustrationPath(svgDef, assetBaseUrl);
                    }
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {isExpanded && (
        <>
          <div ref={sentinelRef} className="h-px w-full" />
          {hasMore && <Spinner size="small" />}
        </>
      )}

      {/* Settings Panel */}
      {selectedIllustration && (
        <div className="flex flex-col gap-[var(--spacing-small)] p-[var(--spacing-small)] bg-background-alt rounded-[var(--border-radius-md)] mt-auto">
          <div className={SECTION_HEADER}>
            <span className={SECTION_TITLE}>
              {isKawaiiSelected ? 'Charakter bearbeiten' : 'Illustration bearbeiten'}
            </span>
            {onDuplicateIllustration && (
              <button
                className={ACTION_BTN}
                onClick={() => onDuplicateIllustration(selectedIllustration.id)}
                title="Duplizieren"
              >
                <FaCopy size={12} />
              </button>
            )}
            <button
              className={ACTION_BTN_DANGER}
              onClick={() => onRemoveIllustration(selectedIllustration.id)}
              title="Entfernen"
            >
              <FaTrash size={12} />
            </button>
          </div>

          {/* Mood selector (only Kawaii) */}
          {kawaiiInstance && (
            <div className="flex flex-col gap-xs">
              <span className="text-[length:var(--font-size-sm)] text-foreground-muted mb-xs">
                Stimmung
              </span>
              <div className="flex gap-xs flex-wrap">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood.id}
                    className={cn(
                      'w-8 h-8 rounded-[var(--border-radius-md)] border border-[var(--border-default,rgba(0,0,0,0.1))] bg-background cursor-pointer text-lg flex items-center justify-center transition-all duration-150 p-0 hover:border-primary-600',
                      kawaiiInstance.mood === mood.id &&
                        'border-primary-600 bg-[var(--primary-50,#e8f5e9)]'
                    )}
                    onClick={() => onUpdateIllustration(kawaiiInstance.id, { mood: mood.id })}
                    title={mood.id}
                  >
                    {mood.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color grid (All) */}
          {selectedIllustration && (
            <div className="flex flex-col gap-xs">
              <span className="text-[length:var(--font-size-sm)] text-foreground-muted mb-xs">
                Farbe
              </span>
              <div className="flex gap-[var(--spacing-small)] flex-wrap">
                {ILLUSTRATION_COLORS.map((color) => (
                  <button
                    key={color.id}
                    className={cn(
                      'w-7 h-7 rounded-full border border-black/10 cursor-pointer transition-transform duration-150 relative p-0 hover:border-[var(--border-default,rgba(0,0,0,0.2))]',
                      selectedIllustration.color === color.color &&
                        'after:content-[""] after:absolute after:-top-1 after:-left-1 after:-right-1 after:-bottom-1 after:border-2 after:border-primary-600 after:rounded-full'
                    )}
                    style={{ backgroundColor: color.color }}
                    onClick={() =>
                      onUpdateIllustration(selectedIllustration.id, { color: color.color })
                    }
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Opacity slider (Both) */}
          <div className="flex flex-col gap-xs">
            <span className="text-[length:var(--font-size-sm)] text-foreground-muted mb-xs">
              Transparenz: {Math.round(selectedIllustration.opacity * 100)}%
            </span>
            <Slider.Root
              className="slider-root"
              value={[selectedIllustration.opacity * 100]}
              onValueChange={([val]) =>
                onUpdateIllustration(selectedIllustration.id, { opacity: val / 100 })
              }
              min={10}
              max={100}
              step={5}
            >
              <Slider.Track className="slider-track">
                <Slider.Range className="slider-range" />
              </Slider.Track>
              <Slider.Thumb className="slider-thumb" />
            </Slider.Root>
          </div>
        </div>
      )}
    </div>
  );
}
