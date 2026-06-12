import { useCallback } from 'react';
import {
  Loader2,
  Pencil,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  SquarePen,
  History,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSliderDeckArtifact } from '../../hooks/useSliderDeckArtifact';

import type { SharepicVariant } from '../../hooks/useChatGraphStream';

interface SliderDeckCardProps {
  variant: SharepicVariant;
}

/** Chat card for a multi-page slider deck: slide pager + deck actions. */
export function SliderDeckCard({ variant }: SliderDeckCardProps) {
  const {
    imageBase64,
    isRendering,
    renderError,
    isExporting,
    slideCount,
    selectedIndex,
    selectSlide,
    headVersion,
    viewVersion,
    isActiveForChat,
    showStepper,
    canDownloadZip,
    stepToVersion,
    restoreViewVersion,
    toggleActive,
    downloadZip,
    openInStudio,
  } = useSliderDeckArtifact(variant);

  const handleZip = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void downloadZip();
    },
    [downloadZip]
  );

  if (renderError) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
        Karussell-Vorschau konnte nicht gerendert werden.
        <button onClick={openInStudio} className="ml-2 text-primary hover:underline">
          Im Editor öffnen
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/sliderdeck relative overflow-hidden rounded-lg border bg-background-alt transition-all hover:shadow-md',
        isActiveForChat
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-primary'
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={openInStudio}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Slider-Karussell im Editor öffnen"
        >
          {isRendering && !imageBase64 && (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                <span className="text-xs text-foreground-muted">Rendere Karussell...</span>
              </div>
            </div>
          )}
          {imageBase64 && (
            <img
              src={imageBase64}
              alt={`Karussell-Folie ${selectedIndex + 1} von ${slideCount}`}
              className={cn(
                'mx-auto max-h-[420px] w-auto transition-opacity',
                isRendering ? 'opacity-50' : 'opacity-100'
              )}
            />
          )}
          {imageBase64 && !isRendering && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/sliderdeck:bg-black/30 group-hover/sliderdeck:opacity-100">
              <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
                <ExternalLink className="h-4 w-4" />
                <span>Im Studio öffnen</span>
              </div>
            </div>
          )}
        </button>

        {slideCount > 1 && imageBase64 && (
          <>
            <button
              onClick={() => selectSlide(selectedIndex - 1)}
              disabled={selectedIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-opacity hover:bg-black/60 disabled:opacity-30"
              aria-label="Vorherige Folie"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => selectSlide(selectedIndex + 1)}
              disabled={selectedIndex >= slideCount - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-opacity hover:bg-black/60 disabled:opacity-30"
              aria-label="Nächste Folie"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
              {selectedIndex + 1}/{slideCount}
            </span>
          </>
        )}
      </div>

      {slideCount > 1 && imageBase64 && (
        <div className="flex items-center justify-center gap-1 border-t border-border px-3 py-1.5">
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              onClick={() => selectSlide(i)}
              className={cn(
                'h-6 min-w-6 rounded px-1 text-xs font-medium transition-colors',
                i === selectedIndex
                  ? 'bg-primary text-white'
                  : 'text-foreground-muted hover:bg-primary/10 hover:text-foreground'
              )}
              aria-label={`Folie ${i + 1} anzeigen`}
              aria-current={i === selectedIndex}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {imageBase64 && (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Slider · {slideCount} Folien
            </span>
            {isActiveForChat && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                <SquarePen className="h-3 w-3" />
                Aktiv im Chat
              </span>
            )}
            {showStepper && (
              <span className="inline-flex items-center gap-0.5 text-xs text-foreground-muted">
                <button
                  onClick={() => void stepToVersion(-1)}
                  className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                  aria-label="Vorherige Version anzeigen"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                v{viewVersion ?? headVersion}/{headVersion}
                <button
                  onClick={() => void stepToVersion(1)}
                  className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                  aria-label="Nächste Version anzeigen"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </span>
            )}
            {viewVersion != null && (
              <button
                onClick={() => void restoreViewVersion()}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
                aria-label={`Version ${viewVersion} wiederherstellen`}
              >
                <History className="h-3 w-3" />
                <span>Wiederherstellen</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleActive}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
                isActiveForChat
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-primary/10 hover:text-foreground'
              )}
              aria-pressed={isActiveForChat}
              aria-label="Dieses Karussell per Chat bearbeiten"
            >
              <SquarePen className="h-3 w-3" />
              <span>{isActiveForChat ? 'Im Chat aktiv' : 'Im Chat bearbeiten'}</span>
            </button>
            {canDownloadZip && (
              <button
                onClick={handleZip}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
                aria-label="Alle Folien als ZIP herunterladen"
              >
                {isExporting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                <span>Als ZIP</span>
              </button>
            )}
            <button
              onClick={openInStudio}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label="Karussell im Studio bearbeiten"
            >
              <Pencil className="h-3 w-3" />
              <span>Studio</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
