import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';

import { activeIndex, initialSlideState, slideReducer } from './slideState';

/**
 * Folienstand mit Durchwechseln — Vorlage ist `useAutoAdvance` in
 * `apps/web/src/components/dashboard/slides.tsx`. Alle `intervalMs` zur nächsten
 * Folie, außer
 *
 * - jemand hat gewählt oder gewischt (dann bleibt die Folie, bis der Pause-Knopf
 *   sie wieder anstößt),
 * - ein Finger liegt auf der Karte (`hold`/`release`),
 * - der Screen ist nicht fokussiert oder die App nicht im Vordergrund,
 * - das System oder das Profil wünscht weniger Bewegung.
 *
 * `null` = nur von Hand. Nach Loslassen und nach der Rückkehr (Screen, App)
 * bekommt die Folie wieder die volle Zeit: eine setTimeout-Kette mit Neustart,
 * kein `setInterval`, der nach dem Hintergrund sofort umschlüge.
 */
export function useAutoAdvance(count: number, intervalMs: number | null) {
  const [state, dispatch] = useReducer(slideReducer, initialSlideState);
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  // Bewusst eine Ref statt State: sonst rendert jede Berührung die Karte samt Folien neu.
  const held = useRef(false);
  const restart = useRef<() => void>(() => {});

  const canAutoplay = intervalMs !== null && count > 1 && !reduceMotion;
  const running = canAutoplay && !state.stopped && focused;

  useEffect(() => {
    if (!running || intervalMs === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => clearTimeout(timer);
    const schedule = () => {
      stop();
      timer = setTimeout(() => {
        if (!held.current) dispatch({ type: 'tick', count });
        schedule();
      }, intervalMs);
    };
    const start = () => {
      if (AppState.currentState === 'active') schedule();
    };
    start();
    restart.current = start;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
      restart.current = () => {};
    };
  }, [running, count, intervalMs]);

  // Stabil (useCallback), damit memoisierte Punkte und Pause-Knopf beim Folienwechsel nicht mitrendern.
  const select = useCallback(
    (index: number) => dispatch({ type: 'select', index, count }),
    [count]
  );
  const step = useCallback((delta: 1 | -1) => dispatch({ type: 'step', delta, count }), [count]);
  const togglePlaying = useCallback(() => dispatch({ type: 'toggle' }), []);
  const hold = useCallback(() => {
    held.current = true;
  }, []);
  const release = useCallback(() => {
    held.current = false;
    restart.current();
  }, []);

  const active = activeIndex(state, count);

  return {
    active,
    select,
    step,
    /** Index der zuletzt von Hand gewählten Folie, sonst `null` — nur die wird angesagt. */
    announced: state.manual ? active : null,
    /** Läuft das Durchwechseln gerade? */
    playing: running,
    /** Gibt es etwas anzuhalten? Nicht bei einer Folie, ohne Intervall oder bei „Bewegung reduzieren“. */
    canPlay: canAutoplay,
    /** Pause/Weiter — WCAG 2.2.2 verlangt einen Weg, das Durchwechseln anzuhalten. */
    togglePlaying,
    hold,
    release,
  };
}
