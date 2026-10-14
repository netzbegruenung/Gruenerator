/**
 * Verwerfen reverts through the undo of the path that applied the suggestion:
 * the per-page store for canvas ops, the page-level undo for a replaced deck.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStoreProvider, useCanvasStore } from '../../../stores/CanvasStoreProvider';

import { FloatingAiSuggestionBanner } from './FloatingAiSuggestionBanner';

import type { PendingAiSuggestion } from '../../../stores/createCanvasEditorStore';

function Seed({
  pending,
  onStore,
}: {
  pending: PendingAiSuggestion;
  onStore: (s: unknown) => void;
}) {
  const store = useCanvasStore();
  useEffect(() => {
    onStore(store);
    store.getState().setPendingAiSuggestion(pending);
  }, [store, pending, onStore]);
  return null;
}

function reject(pending: PendingAiSuggestion) {
  const onUndo = vi.fn();
  const onUndoPages = vi.fn();
  let store: ReturnType<typeof useCanvasStore> | null = null;
  render(
    <CanvasStoreProvider>
      <Seed pending={pending} onStore={(s) => (store = s as typeof store)} />
      <FloatingAiSuggestionBanner onUndo={onUndo} onUndoPages={onUndoPages} />
    </CanvasStoreProvider>
  );
  fireEvent.click(screen.getByLabelText('Vorschlag verwerfen'));
  return { onUndo, onUndoPages, pending: store!.getState().pendingAiSuggestion };
}

describe('FloatingAiSuggestionBanner', () => {
  it('undoes canvas ops through the per-page undo', () => {
    const r = reject({ title: 'Farbe' });
    expect(r.onUndo).toHaveBeenCalledTimes(1);
    expect(r.onUndoPages).not.toHaveBeenCalled();
    expect(r.pending).toBeNull();
  });

  it('undoes a replaced deck through the page-level undo', () => {
    const r = reject({ title: 'Sharepic überarbeitet', undo: 'pages' });
    expect(r.onUndoPages).toHaveBeenCalledTimes(1);
    expect(r.onUndo).not.toHaveBeenCalled();
  });

  it('reads on the green menu bar: title and revert glyph are white, not the page text colour', () => {
    // The banner only renders in TopBar, on --editor-menubar-gradient (#00553B →).
    // text-foreground (#3a3a3a) there was about 1.3:1.
    render(
      <CanvasStoreProvider>
        <Seed pending={{ title: 'Sharepic überarbeitet' }} onStore={() => {}} />
        <FloatingAiSuggestionBanner onUndo={() => {}} onUndoPages={() => {}} />
      </CanvasStoreProvider>
    );
    const title = screen.getByText(/Vorschlag: Sharepic überarbeitet/);
    expect(title).toHaveClass('text-white');
    expect(title).not.toHaveClass('text-foreground');
    expect(screen.getByLabelText('Vorschlag verwerfen')).not.toHaveClass('text-foreground-muted');
  });
});
