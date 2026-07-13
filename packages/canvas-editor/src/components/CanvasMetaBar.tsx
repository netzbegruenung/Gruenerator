import { memo, useCallback, useEffect, useState } from 'react';
import { PiArrowsOut, PiFile, PiMagnifyingGlassMinus, PiMagnifyingGlassPlus } from 'react-icons/pi';

interface CanvasMetaBarProps {
  pageCount: number;
  currentPageIndex: number;
  zoom: number;
  onZoomChange: (value: number) => void;
  fullscreenTargetRef?: React.RefObject<HTMLElement | null>;
  minZoom?: number;
  maxZoom?: number;
}

export const CanvasMetaBar = memo(function CanvasMetaBar({
  pageCount,
  currentPageIndex,
  zoom,
  onZoomChange,
  fullscreenTargetRef,
  minZoom = 0.25,
  maxZoom = 1.5,
}: CanvasMetaBarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const target = fullscreenTargetRef?.current ?? document.documentElement;
    target.requestFullscreen?.().catch(() => {});
  }, [fullscreenTargetRef]);

  const zoomPercent = Math.round(zoom * 100);

  const zoomBtn =
    'size-7 rounded-md flex items-center justify-center text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] transition-colors';

  return (
    <div className="canvas-meta-bar flex items-center gap-3 px-3 py-1.5">
      <button
        className={zoomBtn}
        onClick={() => onZoomChange(Math.max(minZoom, zoom - 0.1))}
        title="Verkleinern"
        type="button"
      >
        <PiMagnifyingGlassMinus size={14} />
      </button>
      <input
        type="range"
        min={Math.round(minZoom * 100)}
        max={Math.round(maxZoom * 100)}
        step={5}
        value={zoomPercent}
        onChange={(e) => onZoomChange(Number(e.currentTarget.value) / 100)}
        className="w-40 accent-[var(--editor-accent)] cursor-pointer"
        aria-label="Zoom"
      />
      <button
        className={zoomBtn}
        onClick={() => onZoomChange(Math.min(maxZoom, zoom + 0.1))}
        title="Vergrößern"
        type="button"
      >
        <PiMagnifyingGlassPlus size={14} />
      </button>
      <span className="text-xs font-medium text-[var(--editor-text)] tabular-nums w-10 text-center select-none">
        {zoomPercent}%
      </span>

      <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--editor-inset)] text-xs text-[var(--editor-text-muted)] select-none">
        <PiFile size={12} />
        Seiten {currentPageIndex + 1}/{pageCount}
      </span>
      <button
        className={zoomBtn}
        onClick={handleFullscreen}
        title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
        type="button"
      >
        <PiArrowsOut size={14} />
      </button>
    </div>
  );
});
