import { useCallback } from 'react';

import { type Slide } from '../../types/slide';

import { SlideCanvas } from './SlideCanvas';

interface SlidePanelProps {
  slides: Slide[];
  currentSlideIndex: number;
  onSlideSelect: (index: number) => void;
  onAddSlide?: () => void;
  onDeleteSlide?: (slideId: string) => void;
  editable?: boolean;
}

/**
 * Left sidebar showing slide thumbnails.
 * Click to select, visual indicator for current slide.
 */
export function SlidePanel({
  slides,
  currentSlideIndex,
  onSlideSelect,
  onAddSlide,
  onDeleteSlide,
  editable = false,
}: SlidePanelProps) {
  const handleSlideClick = useCallback(
    (index: number) => {
      onSlideSelect(index);
    },
    [onSlideSelect]
  );

  return (
    <div className="flex flex-col h-full bg-grey-50 dark:bg-grey-900 border-r border-grey-200 dark:border-grey-700 w-[200px] min-w-[200px]">
      <div className="p-3 border-b border-grey-200 dark:border-grey-700">
        <h3 className="text-sm font-semibold text-grey-700 dark:text-grey-300">Folien</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => handleSlideClick(index)}
            className={`w-full rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${
              index === currentSlideIndex
                ? 'border-primary-500 ring-1 ring-primary-500/30'
                : 'border-grey-200 dark:border-grey-700 hover:border-grey-300'
            }`}
          >
            <div className="relative">
              <div className="pointer-events-none">
                <SlideCanvas
                  slide={{
                    layout: slide.layout,
                    layout_group: slide.layoutGroup,
                    content: slide.content,
                    properties: slide.properties,
                  }}
                  scale={200 / 1280}
                />
              </div>
              <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                {index + 1}
              </div>
            </div>
          </button>
        ))}
      </div>

      {editable && onAddSlide && (
        <div className="p-2 border-t border-grey-200 dark:border-grey-700">
          <button
            onClick={onAddSlide}
            className="w-full py-2 rounded-lg border-2 border-dashed border-grey-300 dark:border-grey-600 text-grey-500 hover:border-primary-400 hover:text-primary-500 transition-colors text-sm flex items-center justify-center gap-1"
          >
            <span className="text-lg leading-none">+</span> Folie hinzufügen
          </button>
        </div>
      )}
    </div>
  );
}
