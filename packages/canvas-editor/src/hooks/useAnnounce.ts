import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { MutableRefObject } from 'react';

export type Announce = (text: string) => void;

export interface Announcer {
  announce: Announce;
  /** Zeitpunkt (ms) der letzten Ansage — wer verzögert ansagt, weicht einer neueren aus. */
  lastAnnouncedAt: MutableRefObject<number>;
}

const noop: Announce = () => {};

/** Ohne Editor-Wurzel (Einzeltests, Standalone-Canvas) sagt `announce` nichts an. */
export const AnnouncerContext = createContext<Announcer>({
  announce: noop,
  lastAnnouncedAt: { current: 0 },
});

/**
 * Sagt Screenreadern einen kurzen deutschen Satz an (Live-Region „status“).
 * Für Aktionen ohne sichtbare Antwort — Löschen, Einfügen, Rückgängig.
 * Rufe es dort, wo die Aktion einmal geschieht (Befehle, Verlauf), nicht an
 * jedem Bedienelement.
 */
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext).announce;
}

/** Nur für Ansagen, die einer neueren Ansage weichen (die Auswahl). */
export function useAnnouncer(): Announcer {
  return useContext(AnnouncerContext);
}

/**
 * Zustand der einen Live-Region des Editors. Der Text wird erst geleert und
 * einen Tick später gesetzt, damit derselbe Satz zweimal hintereinander
 * erneut vorgelesen wird.
 */
export function useLiveAnnouncer(): { announcer: Announcer; message: string } {
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncedAt = useRef(0);

  const announce = useCallback<Announce>((text) => {
    lastAnnouncedAt.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage('');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage(text);
    }, 50);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const announcerRef = useRef<Announcer>({ announce, lastAnnouncedAt });
  return { announcer: announcerRef.current, message };
}
