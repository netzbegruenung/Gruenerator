import { useCallback, useRef, useState } from 'react';

import { usePresentationStore } from '../../stores/presentationStore';
import { type ExportFormat, type PresentationWithSlides } from '../../types/slide';

import { SlideCanvas } from './SlideCanvas';
import { SlidePanel } from './SlidePanel';
import { SlideToolbar } from './SlideToolbar';

interface SlideEditorProps {
  presentation: PresentationWithSlides;
  editable?: boolean;
  onBack?: () => void;
  onTitleChange?: (title: string) => void;
  onExport?: (format: ExportFormat) => void;
  isSaving?: boolean;
}

/**
 * Main slide editor layout.
 * Three-panel design: thumbnail sidebar (left), canvas (center), toolbar (top).
 */
export function SlideEditor({
  presentation,
  editable = false,
  onBack,
  onTitleChange,
  onExport,
  isSaving = false,
}: SlideEditorProps) {
  const { currentSlideIndex, setCurrentSlideIndex } = usePresentationStore();
  const [isPresentMode, setIsPresentMode] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const currentSlide = presentation.slides[currentSlideIndex];

  const handlePresent = useCallback(() => {
    setIsPresentMode(true);
  }, []);

  const handleExitPresent = useCallback(() => {
    setIsPresentMode(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isPresentMode) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
          e.preventDefault();
          setCurrentSlideIndex(Math.min(currentSlideIndex + 1, presentation.slides.length - 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setCurrentSlideIndex(Math.max(currentSlideIndex - 1, 0));
        } else if (e.key === 'Escape') {
          handleExitPresent();
        }
      }
    },
    [
      isPresentMode,
      currentSlideIndex,
      presentation.slides.length,
      setCurrentSlideIndex,
      handleExitPresent,
    ]
  );

  if (isPresentMode) {
    return (
      <div
        className="fixed inset-0 bg-black z-50 flex items-center justify-center"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="presentation"
      >
        <button
          onClick={handleExitPresent}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Beenden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/80 text-sm">
          <button
            onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
            disabled={currentSlideIndex === 0}
            className="p-1 hover:text-white disabled:opacity-30"
          >
            ←
          </button>
          <span>
            {currentSlideIndex + 1} / {presentation.slides.length}
          </span>
          <button
            onClick={() =>
              setCurrentSlideIndex(Math.min(presentation.slides.length - 1, currentSlideIndex + 1))
            }
            disabled={currentSlideIndex === presentation.slides.length - 1}
            className="p-1 hover:text-white disabled:opacity-30"
          >
            →
          </button>
        </div>

        {currentSlide && (
          <div className="w-full max-w-[90vw] max-h-[90vh]" style={{ aspectRatio: '16/9' }}>
            <SlideCanvas
              slide={{
                layout: currentSlide.layout,
                layout_group: currentSlide.layoutGroup,
                content: currentSlide.content,
                properties: currentSlide.properties,
              }}
              scale={Math.min((window.innerWidth * 0.9) / 1280, (window.innerHeight * 0.9) / 720)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" onKeyDown={handleKeyDown} tabIndex={-1}>
      <SlideToolbar
        title={presentation.title}
        onTitleChange={editable ? onTitleChange : undefined}
        onExport={onExport}
        onPresent={handlePresent}
        onBack={onBack}
        isSaving={isSaving}
        editable={editable}
        slideCount={presentation.slides.length}
        currentSlide={currentSlideIndex}
      />

      <div className="flex flex-1 overflow-hidden">
        <SlidePanel
          slides={presentation.slides}
          currentSlideIndex={currentSlideIndex}
          onSlideSelect={setCurrentSlideIndex}
          editable={editable}
        />

        <div
          ref={mainRef}
          className="flex-1 overflow-auto bg-grey-100 dark:bg-grey-900 p-8 flex items-start justify-center"
        >
          {currentSlide ? (
            <div className="w-full max-w-[960px]">
              <div className="rounded-xl shadow-xl overflow-hidden">
                <SlideCanvas
                  slide={{
                    layout: currentSlide.layout,
                    layout_group: currentSlide.layoutGroup,
                    content: currentSlide.content,
                    properties: currentSlide.properties,
                  }}
                  isEditMode={editable}
                  scale={Math.min(960 / 1280, 1)}
                />
              </div>

              {currentSlide.speakerNote && (
                <div className="mt-4 p-4 bg-white dark:bg-grey-800 rounded-lg border border-grey-200 dark:border-grey-700">
                  <h4 className="text-xs font-semibold text-grey-500 uppercase mb-2">
                    Sprechernotizen
                  </h4>
                  <p className="text-sm text-grey-700 dark:text-grey-300 whitespace-pre-wrap">
                    {currentSlide.speakerNote}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-grey-400">
              Keine Folien vorhanden
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
