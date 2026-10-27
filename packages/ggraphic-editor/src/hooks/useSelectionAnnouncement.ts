// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef } from 'react';

import { useAnnouncer } from '@ggraphic/editor/hooks/useAnnounce';
import { messages } from '@ggraphic/editor/i18n/messages';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

/** So lange ruht die Auswahl, bevor sie angesagt wird: Pfeiltasten in der Ebenen-Liste ziehen vorbei. */
export const SELECTION_ANNOUNCE_DELAY_MS = 400;

/** Der Text der Auswahl-Ansage; `null` = nichts ansagen. */
export function selectionMessage(
  ids: readonly string[],
  labelOf: (id: string) => string | null
): string | null {
  if (ids.length === 0) return messages().announce.selectionCleared;
  if (ids.length > 1) return messages().announce.elementsSelected(ids.length);
  const label = labelOf(ids[0]!);
  return label ? messages().announce.selected(label) : null;
}

/**
 * In der Ebenen-Liste liest der Screenreader die fokussierte Option ohnehin vor.
 * Die Liste wird über denselben Katalogtext gefunden, den sie als aria-label
 * trägt (`sidebar.layers.title`) — eine andere Sprache bricht das nicht.
 */
function focusInLayerList(): boolean {
  const active = document.activeElement;
  const label = messages().sidebar.layers.title.replace(/["\\]/g, '\\$&');
  return (
    active instanceof Element && active.closest(`[role=listbox][aria-label="${label}"]`) !== null
  );
}

/**
 * Sagt die Auswahl dieser Seite an — entprellt, nur der Endzustand — und
 * weicht jeder Ansage, die seit der Änderung kam (Löschen, Einfügen …):
 * der Befehl sagt mehr als „Auswahl aufgehoben“. Nur die aktive Seite spricht:
 * eine inaktive hebt beim Seitenwechsel ihre Auswahl auf, und das ist keine
 * Nachricht.
 */
export function useSelectionAnnouncement(
  store: CanvasEditorStoreApi,
  labelOf: (id: string) => string | null,
  isActivePage: boolean
): void {
  const { announce, lastAnnouncedAt } = useAnnouncer();
  const labelOfRef = useRef(labelOf);
  labelOfRef.current = labelOf;

  useEffect(() => {
    if (!isActivePage) return undefined;
    let previous = store.getState().selectedLayerIds;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((state) => {
      const ids = state.selectedLayerIds;
      if (ids === previous) return;
      const wasEmpty = previous.length === 0;
      previous = ids;
      if (timer) clearTimeout(timer);
      if (wasEmpty && ids.length === 0) return;
      const changedAt = Date.now();
      timer = setTimeout(() => {
        timer = null;
        if (lastAnnouncedAt.current >= changedAt || focusInLayerList()) return;
        const text = selectionMessage(store.getState().selectedLayerIds, (id) =>
          labelOfRef.current(id)
        );
        if (text) announce(text);
      }, SELECTION_ANNOUNCE_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store, announce, lastAnnouncedAt, isActivePage]);
}
