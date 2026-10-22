import { Check, LayoutTemplate, RotateCcw, Sparkles } from 'lucide-react';

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
 *
 * A suggestion flagged `undo: 'pages'` (spec path: the deck was replaced in one
 * Yjs step) reverts through `onUndoPages`, which discards that replacement for
 * good (`discardReplaceDeck`: Redo does not bring it back). The „Vorlagen"
 * tab uses the same banner after replacing a design (`source: 'vorlage'`).
 *
 * `variant="card"` is the same decision over the locked canvas, in the slot of
 * the selection bar: while a suggestion is open the pages take no input.
 */
interface FloatingAiSuggestionBannerProps {
  onUndo: () => void;
  onUndoPages: () => void;
  variant?: 'bar' | 'card';
}

export function FloatingAiSuggestionBanner({
  onUndo,
  onUndoPages,
  variant = 'bar',
}: FloatingAiSuggestionBannerProps) {
  const pending = useCanvasStoreSelector((s) => s.pendingAiSuggestion);
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  if (!pending) return null;

  const noun = pending.source === 'vorlage' ? 'Vorlage' : 'Vorschlag';
  const Icon = pending.source === 'vorlage' ? LayoutTemplate : Sparkles;
  const handleAccept = () => setPending(null);

  const handleReject = () => {
    if (pending.undo === 'pages') onUndoPages();
    else onUndo();
    setPending(null);
  };

  if (variant === 'card') {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-3 max-w-full rounded-xl border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] py-1.5 pl-3 pr-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] animate-canvas-slide-down-fade"
      >
        <Icon className="size-4 shrink-0 text-[var(--editor-text-secondary)]" aria-hidden="true" />
        <span className="min-w-0 truncate text-[13px] text-[var(--editor-text)]">
          <strong className="font-medium">
            {noun} „{pending.title}“
          </strong>{' '}
          ist noch offen. Erst behalten oder verwerfen, dann weiter bearbeiten.
        </span>
        <button
          type="button"
          onClick={handleReject}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border-none bg-transparent px-2 text-[13px] font-medium text-[var(--editor-text)] cursor-pointer transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Verwerfen
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border-none bg-primary px-3 text-[13px] font-medium text-white cursor-pointer transition-opacity duration-200 hover:opacity-90"
        >
          <Check className="size-4" aria-hidden="true" />
          Behalten
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <Icon className="size-4 shrink-0 text-white/90" aria-hidden="true" />
      <span className="flex-1 truncate text-xs font-medium text-white">
        {noun}: {pending.title}
      </span>
      <button
        type="button"
        onClick={handleReject}
        className="size-8 max-canvas-mobile:size-10 rounded-full border-none bg-transparent flex items-center justify-center text-white/90 transition-[background-color,color] duration-200 hover:bg-white/15 hover:text-white cursor-pointer"
        title={`${noun} verwerfen (Rückgängig)`}
        aria-label={`${noun} verwerfen`}
      >
        <RotateCcw className="size-4" />
      </button>
      <button
        type="button"
        onClick={handleAccept}
        className="size-8 max-canvas-mobile:size-10 rounded-full border-none bg-primary flex items-center justify-center text-white transition-opacity duration-200 hover:opacity-90 cursor-pointer"
        title={`${noun} behalten`}
        aria-label={`${noun} behalten`}
      >
        <Check className="size-4" />
      </button>
    </div>
  );
}
