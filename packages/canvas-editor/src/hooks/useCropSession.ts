import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';
import { restoreCropSnapshot, takeCropSnapshot, type CropSnapshot } from '../utils/cropSession';

import type { CanvasElementConfig } from '../configs/types';
import type { HistorySessionMark } from '../stores/createCanvasEditorStore';

interface CropSession {
  id: string;
  snapshot: CropSnapshot | null;
  mark: HistorySessionMark | null;
}

export interface CropSessionDoors {
  /** Stellt den Zuschnitt vom Betreten des Modus wieder her und beendet ihn. */
  cancel: () => void;
  /** Beendet den Modus mit dem aktuellen Stand. */
  finish: () => void;
  /** Wie oft „Abbrechen" für dieses Element lief: wer darauf wartet, verwirft sein Ergebnis, wenn die Zahl wächst. */
  cancelCount: (id: string) => number;
}

/**
 * Eine Zuschneide-Sitzung je Seite, für Hintergrundfoto und eigene Bilder.
 * Sie beginnt, sobald `croppingElement` gesetzt wird, gleich von wo. Jedes
 * andere Ende als „Abbrechen" — Escape, Auswahlwechsel, Klick daneben,
 * Doppelklick — ist „Fertig" und wird im Verlauf ein Schritt.
 */
export function useCropSession({
  elements,
  readState,
  restore,
  checkpoint,
}: {
  elements: readonly CanvasElementConfig[];
  /** Der zuletzt übernommene Zustand der Seite. */
  readState: () => Record<string, unknown>;
  /** Der Weg, auf dem auch Rückgängig Zustand zurückschreibt. */
  restore: (state: Record<string, unknown>) => void;
  checkpoint: () => void;
}): CropSessionDoors {
  const store = useCanvasStore();
  const sessionRef = useRef<CropSession | null>(null);
  // Je Element: Abbrechen bei B verwirft kein laufendes (bezahltes) Erweitern bei A.
  const cancelsRef = useRef(new Map<string, number>());
  const inputsRef = useRef({ elements, readState, restore, checkpoint });
  useLayoutEffect(() => {
    inputsRef.current = { elements, readState, restore, checkpoint };
  });

  useEffect(() => {
    let previous = store.getState().croppingElement;
    return store.subscribe((state) => {
      const next = state.croppingElement;
      if (next === previous) return;
      previous = next;
      const { elements, readState, checkpoint } = inputsRef.current;
      const ended = sessionRef.current;
      if (ended) {
        sessionRef.current = null;
        checkpoint();
        if (ended.mark) store.getState().endHistorySession(ended.mark, 'squash');
      }
      if (next !== null) {
        // Der Stand davor wird ein eigener Eintrag: auf ihn springt Abbrechen zurück.
        checkpoint();
        sessionRef.current = {
          id: next,
          snapshot: takeCropSnapshot(readState(), elements, next),
          mark: store.getState().beginHistorySession(),
        };
      }
    });
  }, [store]);

  const finish = useCallback(() => store.getState().setCroppingElement(null), [store]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    const id = session?.id ?? store.getState().croppingElement;
    if (id) cancelsRef.current.set(id, (cancelsRef.current.get(id) ?? 0) + 1);
    if (!session) {
      finish();
      return;
    }
    sessionRef.current = null;
    const { readState, restore, checkpoint } = inputsRef.current;
    checkpoint();
    // Hinter den Beginn zurückgenommen: der Stand passt schon zum Verlauf, ein Wiederherstellen risse ihn davon los.
    const live = session.mark ? store.getState().endHistorySession(session.mark, 'discard') : true;
    const state = readState();
    const restored = session.snapshot ? restoreCropSnapshot(state, session.snapshot) : null;
    if (live && restored) restore({ ...state, ...restored });
    finish();
  }, [store, finish]);

  const cancelCount = useCallback((id: string) => cancelsRef.current.get(id) ?? 0, []);

  return useMemo(() => ({ cancel, finish, cancelCount }), [cancel, finish, cancelCount]);
}
