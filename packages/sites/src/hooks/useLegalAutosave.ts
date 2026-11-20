import { type SiteLegalDraft } from '@gruenerator/contracts';
import { toast } from '@gruenerator/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type SaveStatus } from '../draft/useSiteDraftSession';

import {
  enqueueLegalSave,
  forgetLegal,
  hasFailedLegalSave,
  registerLegalFlusher,
  rememberLegal,
} from './legalSaveGate';
import { useLeaveWarning } from './useLeaveWarning';
import { useSite } from './useSite';

const UNSAVED_MESSAGE =
  'Deine Angaben sind noch nicht gespeichert. Öffne das Impressum und versuche es noch einmal.';

export const LEGAL_AUTOSAVE_DELAY_MS = 800;

export type LegalSaveStatus = SaveStatus | 'error';

export function useLegalAutosave(siteId: string, legal: SiteLegalDraft) {
  const { updateSite } = useSite();
  const [status, setStatus] = useState<LegalSaveStatus>(() =>
    hasFailedLegalSave(siteId) ? 'error' : 'saved'
  );
  const latest = useRef(legal);
  const saved = useRef(legal);
  const generation = useRef(0);
  latest.current = legal;

  const sending = useRef<SiteLegalDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mounted = useRef(true);

  const save = useCallback(() => {
    const mine = ++generation.current;
    sending.current = latest.current;
    setStatus('saving');
    const run = async () => {
      const current = latest.current;
      try {
        // The mutation writes the returned site into the cache itself.
        await updateSite({ id: siteId, data: { legal: current } });
        forgetLegal(siteId, current);
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
          if (!mounted.current)
            toast.error('Impressum nicht gespeichert', { description: UNSAVED_MESSAGE });
        }
        return false;
      }
    };
    return enqueueLegalSave(siteId, run);
  }, [siteId, updateSite]);

  useEffect(() => {
    if (legal === saved.current) return;
    rememberLegal(siteId, legal);
    setStatus('saving');
    const handle = setTimeout(() => void save(), LEGAL_AUTOSAVE_DELAY_MS);
    timer.current = handle;
    return () => clearTimeout(handle);
  }, [legal, save, siteId]);

  const flush = useRef(() => {});
  flush.current = () => {
    if (timer.current) clearTimeout(timer.current);
    if (latest.current !== saved.current && latest.current !== sending.current) void save();
  };

  useEffect(() => {
    mounted.current = true;
    const onPageHide = () => flush.current();
    window.addEventListener('pagehide', onPageHide);
    const unregister = registerLegalFlusher(() => flush.current());
    return () => {
      mounted.current = false;
      unregister();
      window.removeEventListener('pagehide', onPageHide);
      flush.current();
    };
  }, []);

  useLeaveWarning(status !== 'saved');

  const retry = useCallback(() => void save(), [save]);

  return { status, retry };
}
