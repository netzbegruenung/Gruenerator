import { type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type RefObject,
  type TouchEvent,
} from 'react';
import { PiX } from 'react-icons/pi';

/** Folienbreite des Formats `slide-16-9`. */
const SLIDE_WIDTH_PX = 1920;
const MAX_RENDER_WIDTH_PX = 3840;
const SWIPE_MIN_PX = 50;

/** Renderbreite = Bildschirmbreite in Gerätepixeln, gedeckelt auf 3840 px. */
export function presentPixelRatio(screenWidthCssPx: number, devicePixelRatio: number): number {
  const target = Math.min(Math.max(screenWidthCssPx * devicePixelRatio, 1), MAX_RENDER_WIDTH_PX);
  return target / SLIDE_WIDTH_PX;
}

interface CanvasPresentModeProps {
  exportApi: RefObject<CanvasEditorExportApi | null>;
  /** Index der Folie, mit der die Präsentation beginnt. */
  startIndex?: number;
  onClose: () => void;
}

/**
 * Vollbild-Präsentation eines Folien-Decks: alle Seiten werden einmal über die
 * Export-API gerendert und dann als Bilder durchgeblättert. Ohne Fullscreen API
 * bleibt das Overlay über der Seite stehen.
 */
export function CanvasPresentMode({
  exportApi,
  startIndex = 0,
  onClose,
}: CanvasPresentModeProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [images, setImages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    let cancelled = false;
    const api = exportApi.current;
    if (!api) {
      void Promise.resolve().then(() => {
        if (!cancelled) setError('Die Folien konnten nicht gerendert werden.');
      });
      return () => {
        cancelled = true;
      };
    }
    const ratio = presentPixelRatio(
      window.screen?.width || window.innerWidth,
      window.devicePixelRatio || 1
    );
    api
      .capturePages({ pixelRatio: ratio })
      .then((pages) => {
        if (cancelled) return;
        setImages(pages);
        setIndex((i) => Math.min(i, Math.max(pages.length - 1, 0)));
      })
      .catch(() => {
        if (!cancelled) setError('Die Folien konnten nicht gerendert werden.');
      });
    return () => {
      cancelled = true;
    };
  }, [exportApi]);

  // Vollbild anfragen; schlägt es fehl, bleibt das feste Overlay das Fallback.
  useEffect(() => {
    const root = rootRef.current;
    root?.focus();
    let enteredFullscreen = false;
    if (root?.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreen = true;
        })
        .catch(() => {});
    }
    // Esc im Vollbild verarbeitet der Browser selbst — dann schließen wir mit.
    const onFullscreenChange = () => {
      if (enteredFullscreen && !document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      enteredFullscreen = false;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  const total = images?.length ?? 0;
  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(total - 1, 0))),
    [total]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          go(-1);
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, onClose]);

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const delta = end - start;
    if (Math.abs(delta) >= SWIPE_MIN_PX) go(delta < 0 ? 1 : -1);
  };

  const current = images?.[index] ?? null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Präsentation"
      tabIndex={-1}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black outline-none"
    >
      {current ? (
        <img
          src={current}
          alt={`Folie ${index + 1} von ${total}`}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <p role={error ? 'alert' : 'status'} className="text-sm text-white">
          {error ?? 'Folien werden gerendert …'}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Präsentation beenden"
        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <PiX size={18} aria-hidden="true" />
      </button>
      {total > 0 && (
        <p
          aria-live="polite"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs text-white"
        >
          {index + 1} / {total}
        </p>
      )}
    </div>
  );
}
