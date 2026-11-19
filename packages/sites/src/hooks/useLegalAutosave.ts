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

  const save = useCallback(
    () =>
      trackLegalSave(
        (async () => {
          const current = latest.current;
          const mine = ++generation.current;
          sending.current = current;
          setStatus('saving');
          try {
            await updateSite({ id: siteId, data: { legal: current } });
            saved.current = current;
            sending.current = null;
            if (mine === generation.current) setStatus('saved');
            return true;
          } catch {
            sending.current = null;
            if (mine === generation.current) setStatus('error');
            return false;
          }
        })()
      ),
    [siteId, updateSite]
  );

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
