import { Check, RotateCcw, Sparkles } from 'lucide-react';

import { useCanvasStoreSelector } from '../../../stores/CanvasStoreProvider';

/**
 * Banner shown in the canvas top bar after the AI auto-applies a suggestion.
 * Two actions:
 *   - ✓ Behalten: clears the pending flag.
 *   - ↶ Verwerfen: invokes the canvas's standard undo (passed in by Toolbar
 *     from `toolbarHandlers.undo` in CanvasEditor — same path as the existing
 *     toolbar undo button and Cmd+Z, which hits the per-page inner store).
 *
 * `onUndo` MUST be the per-page canvas undo (via GenericCanvas's imperative
 * handle), NOT `useCanvasStoreSelector(s => s.undo)` — the banner renders
 * outside the per-page CanvasStoreProvider, so the selector falls through to
 * the singleton store which has no history.
 */
interface FloatingAiSuggestionBannerProps {
  onUndo: () => void;
}

export function FloatingAiSuggestionBanner({ onUndo }: FloatingAiSuggestionBannerProps) {
  const pending = useCanvasStoreSelector((s) => s.pendingAiSuggestion);
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  if (!pending) return null;

  const handleAccept = () => setPending(null);

  const handleReject = () => {
    onUndo();
    setPending(null);
  };

  return (
    <div className="flex w-full items-center gap-2">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex-1 truncate text-xs font-medium text-foreground">
        Vorschlag: {pending.title}
      </span>
      <button
        type="button"
        onClick={handleReject}
        className="size-8 max-canvas-mobile:size-10 rounded-full border-none bg-transparent flex items-center justify-center text-foreground-muted transition-[background-color,color] duration-200 hover:bg-hover-alt hover:text-foreground cursor-pointer"
        title="Vorschlag verwerfen (Rückgängig)"
        aria-label="Vorschlag verwerfen"
      >
        <RotateCcw className="size-4" />
      </button>
      <button
        type="button"
        onClick={handleAccept}
        className="size-8 max-canvas-mobile:size-10 rounded-full border-none bg-primary flex items-center justify-center text-white transition-opacity duration-200 hover:opacity-90 cursor-pointer"
        title="Vorschlag behalten"
        aria-label="Vorschlag behalten"
      >
        <Check className="size-4" />
      </button>
    </div>
  );
}
