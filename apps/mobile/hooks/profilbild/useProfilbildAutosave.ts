import { FREE_BACKGROUND_ID } from '@gruenerator/shared/profilbild';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProfilbildSnapshot } from './useProfilbildShare';

/** The pause after the last edit before the Profilbild is saved. */
export const AUTOSAVE_DELAY = 1500;

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

/** What a saved Profilbild is made of; a change to any of it is worth saving. */
export function profilbildSignature({ model, backgroundId, custom }: ProfilbildSnapshot): string {
  return JSON.stringify([
    model.person,
    backgroundId,
    // Every free colour shares one id; only the colour itself tells two apart.
    backgroundId === FREE_BACKGROUND_ID ? model.background : null,
    custom?.uri ?? null,
    model.stickers.map(({ src, x, y, width, height, rotation }) => [
      src,
      x,
      y,
      width,
      height,
      rotation,
    ]),
  ]);
}

/**
 * Saves the Profilbild to „Zuletzt" after a pause in editing, like web.
 * `session` identifies the photo being edited (a new one starts fresh); a
 * `reopened` Profilbild counts as saved until something changes. A change made
 * just before leaving is still saved.
 */
export function useProfilbildAutosave(
  session: unknown,
  snapshot: ProfilbildSnapshot | null,
  persist: (snapshot: ProfilbildSnapshot) => Promise<void>,
  reopened: boolean
) {
  // Tied to its photo: a new one starts without a status.
  const [status, setStatus] = useState<{ session: unknown; state: AutosaveState }>({
    session: null,
    state: 'idle',
  });
  const forSession = useRef<unknown>(null);
  // The signature last saved or loaded; `undefined` until a reopened one has settled.
  const lastSaved = useRef<string | undefined>('');
  const current = useRef('');
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!snapshot) {
      // „Anderes Foto": a save still pending belongs to the photo just dropped and
      // would otherwise run on unmount against the next photo's share.
      pending.current = null;
      return;
    }
    if (forSession.current !== session) {
      forSession.current = session;
      lastSaved.current = reopened ? undefined : '';
    }
    const signature = profilbildSignature(snapshot);
    current.current = signature;
    if (lastSaved.current === undefined) {
      lastSaved.current = signature;
      return;
    }
    if (signature === lastSaved.current) return;
    const run = () => {
      pending.current = null;
      lastSaved.current = signature;
      setStatus({ session, state: 'saving' });
      persist(snapshot).then(
        () => setStatus({ session, state: 'saved' }),
        () => setStatus({ session, state: 'error' })
      );
    };
    pending.current = run;
    const timer = setTimeout(run, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  });

  useEffect(() => () => pending.current?.(), []);

  /** Tells the autosave that the screen as it is has just been saved by hand. */
  const noteSaved = useCallback(() => {
    lastSaved.current = current.current;
    pending.current = null;
    setStatus({ session: forSession.current, state: 'saved' });
  }, []);

  return { state: status.session === session ? status.state : 'idle', noteSaved };
}
