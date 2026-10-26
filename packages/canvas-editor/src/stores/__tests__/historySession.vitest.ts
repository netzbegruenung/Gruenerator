import { describe, expect, it } from 'vitest';

import { createCanvasEditorStore } from '../createCanvasEditorStore';

function storeWith(...values: number[]) {
  const store = createCanvasEditorStore();
  for (const v of values) store.getState().saveToHistory({ v });
  return store;
}

const entries = (store: ReturnType<typeof storeWith>) =>
  store.getState().history.map((e) => e.componentState?.v);

describe('Verlaufs-Sitzung', () => {
  it('squash legt die Einträge der Sitzung zu einem zusammen', () => {
    const store = storeWith(0, 1);
    const mark = store.getState().beginHistorySession()!;
    store.getState().saveToHistory({ v: 2 });
    store.getState().saveToHistory({ v: 3 });
    store.getState().endHistorySession(mark, 'squash');
    expect(entries(store)).toEqual([0, 1, 3]);
    expect(store.getState().historyIndex).toBe(2);
  });

  it('discard verwirft die Sitzung, auch ihren Redo-Rest', () => {
    const store = storeWith(0, 1);
    const mark = store.getState().beginHistorySession()!;
    store.getState().saveToHistory({ v: 2 });
    store.getState().undo();
    store.getState().endHistorySession(mark, 'discard');
    expect(entries(store)).toEqual([0, 1]);
    expect(store.getState().historyIndex).toBe(1);
    expect(store.getState().canRedo()).toBe(false);
  });

  it('eine Sitzung ohne Speicherung lässt einen älteren Redo-Rest stehen', () => {
    const store = storeWith(0, 1, 2);
    store.getState().undo();
    const mark = store.getState().beginHistorySession()!;
    store.getState().endHistorySession(mark, 'discard');
    store.getState().endHistorySession(mark, 'squash');
    expect(entries(store)).toEqual([0, 1, 2]);
    expect(store.getState().historyIndex).toBe(1);
  });

  it('squash ohne Unterschied zum Beginn hinterlässt keinen Schritt', () => {
    const store = storeWith(0, 1);
    const mark = store.getState().beginHistorySession()!;
    store.getState().saveToHistory({ v: 2 });
    store.getState().saveToHistory({ v: 1 });
    store.getState().endHistorySession(mark, 'squash');
    expect(entries(store)).toEqual([0, 1]);
  });

  it('übersteht das Abschneiden am Verlaufsende', () => {
    const store = storeWith(0, 1);
    store.setState({ maxHistorySize: 3 });
    const mark = store.getState().beginHistorySession()!;
    store.getState().saveToHistory({ v: 2 });
    store.getState().saveToHistory({ v: 3 });
    store.getState().endHistorySession(mark, 'discard');
    expect(entries(store)).toEqual([1]);
    expect(store.getState().historyIndex).toBe(0);
  });

  it('ein hinter den Beginn zurückgenommener Verlauf bleibt unberührt', () => {
    const store = storeWith(0, 1);
    const mark = store.getState().beginHistorySession()!;
    store.getState().saveToHistory({ v: 2 });
    store.getState().undo();
    store.getState().undo();
    store.getState().endHistorySession(mark, 'discard');
    expect(entries(store)).toEqual([0, 1, 2]);
    expect(store.getState().historyIndex).toBe(0);
  });
});
