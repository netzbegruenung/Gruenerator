import { useEffect, useRef } from 'react';

/**
 * Meldet Änderungen bestimmter Zustandsschlüssel als `on<Key>Change` an den Host.
 *
 * Die Vorlagen-Stores ändern diese Felder nur im lokalen Komponentenzustand —
 * anders als Textfelder, die durch ihren eigenen Callback laufen. Ohne diese
 * Brücke erreicht weder das gewählte Hintergrundbild noch ein freies Element
 * den Seitenzustand, und beides ist nach dem Neuladen weg (#3416).
 *
 * Verglichen wird über die Referenz: `setState` legt bei jeder echten Änderung
 * neue Objekte an, ein unveränderter Render behält sie. Ein trotzdem
 * durchgereichter Gleichstand — nach einer Fernbearbeitung baut
 * `createInitialState` alle Sammlungen neu auf — ist unschädlich, weil
 * `updatePageStateById` strukturell vergleicht, bevor es schreibt.
 *
 * Für Schlüssel, die die aktive Vorlage nicht wirklich führt, passiert nichts:
 * `callbacks` hat dann keinen passenden Eintrag.
 */
export function useEmitHostStateChanges(
  state: Record<string, unknown>,
  callbacks: Record<string, ((val: unknown) => void) | undefined>,
  keys: readonly string[]
): void {
  const prevRef = useRef<Record<string, unknown>>({});
  const seededRef = useRef(false);

  useEffect(() => {
    if (!seededRef.current) {
      // Beim ersten Render nur merken, sonst meldete der geladene Zustand
      // sich selbst als Änderung zurück.
      seededRef.current = true;
      for (const key of keys) prevRef.current[key] = state[key];
      return;
    }
    for (const key of keys) {
      const next = state[key];
      if (next === prevRef.current[key]) continue;
      prevRef.current[key] = next;
      callbacks[`on${key.charAt(0).toUpperCase()}${key.slice(1)}Change`]?.(next);
    }
  }, [state, callbacks, keys]);
}
