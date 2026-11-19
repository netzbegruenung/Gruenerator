import { type SiteLegalDraft } from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type SaveStatus } from '../draft/useSiteDraftSession';

import { registerLegalFlusher, trackLegalSave } from './legalSaveGate';
import { useLeaveWarning } from './useLeaveWarning';
import { useSite } from './useSite';

export const LEGAL_AUTOSAVE_DELAY_MS = 800;

export type LegalSaveStatus = SaveStatus | 'error';

export function useLegalAutosave(siteId: string, legal: SiteLegalDraft) {
  const { updateSite } = useSite();
  const [status, setStatus] = useState<LegalSaveStatus>('saved');
  const latest = useRef(legal);
  const saved = useRef(legal);
  const generation = useRef(0);
  latest.current = legal;

  const sending = useRef<SiteLegalDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(0);

  // One PUT at a time: a save queued behind another sends the latest value when its turn comes.
  const save = useCallback(() => {
    const mine = ++generation.current;
    sending.current = latest.current;
    setStatus('saving');
    const run = async () => {
      const current = latest.current;
      try {
        await updateSite({ id: siteId, data: { legal: current } });
        if (mine === generation.current) {
          saved.current = current;
          sending.current = null;
          setStatus('saved');
        }
        return true;
      } catch {
        if (mine === generation.current) {
          sending.current = null;
          setStatus('error');
        }
        return false;
      }
    };
    const result = queued.current === 0 ? run() : tail.current.then(run);
    queued.current += 1;
    tail.current = result;
    void result.then(() => {
      queued.current -= 1;
    });
    return trackLegalSave(result);
  }, [siteId, updateSite]);

  useEffect(() => {
    if (legal === saved.current) return;
    setStatus('saving');
    const handle = setTimeout(() => void save(), LEGAL_AUTOSAVE_DELAY_MS);
    timer.current = handle;
    return () => clearTimeout(handle);
  }, [legal, save]);

  const flush = useRef(() => {});
  flush.current = () => {
    if (timer.current) clearTimeout(timer.current);
    if (latest.current !== saved.current && latest.current !== sending.current) void save();
  };

  useEffect(() => {
    const onPageHide = () => flush.current();
    window.addEventListener('pagehide', onPageHide);
    const unregister = registerLegalFlusher(() => flush.current());
    return () => {
      unregister();
      window.removeEventListener('pagehide', onPageHide);
      flush.current();
    };
  }, []);

  useLeaveWarning(status !== 'saved');

  const retry = useCallback(() => void save(), [save]);

  return { status, retry };
}
