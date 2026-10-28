// SPDX-License-Identifier: MPL-2.0
/**
 * Wie „Text bearbeiten“ (F2, Enter in der Ebenen-Liste, Kontextmenü) den
 * Editor eines Elements öffnet, das auf Doppelklick an einem inneren Knoten
 * hört — Balken- und Kreis-Zeilen, die Pille. Das Element meldet hier je Seite
 * (Store) und Id seinen Öffner; `editText` ruft ihn direkt, ohne einen
 * nachgestellten Konva-Doppelklick auf einen Knoten, der dafür gar nicht hört.
 */

import { useEffect, useRef } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider.js';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore.js';

const openers = new WeakMap<CanvasEditorStoreApi, Map<string, () => void>>();

/** Öffnet den Editor von `id`; false, wenn das Element keinen Öffner gemeldet hat. */
export function openTextEditor(store: CanvasEditorStoreApi, id: string): boolean {
  const open = openers.get(store)?.get(id);
  if (!open) return false;
  open();
  return true;
}

/** Meldet den Öffner des Elements `id` für seine Seite an, solange es steht. */
export function useTextEditorOpener(id: string, open: () => void): void {
  const store = useCanvasStore();
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    let byId = openers.get(store);
    if (!byId) {
      byId = new Map();
      openers.set(store, byId);
    }
    const entry = () => openRef.current();
    byId.set(id, entry);
    return () => {
      if (byId.get(id) === entry) byId.delete(id);
    };
  }, [store, id]);
}
