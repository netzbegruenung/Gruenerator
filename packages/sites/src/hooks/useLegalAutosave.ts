import { type SiteLegalDraft } from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type SaveStatus } from '../draft/useSiteDraftSession';

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

  const save = useCallback(async () => {
    const current = latest.current;
    const mine = ++generation.current;
    setStatus('saving');
    try {
      await updateSite({ id: siteId, data: { legal: current } });
      saved.current = current;
      if (mine === generation.current) setStatus('saved');
    } catch {
      if (mine === generation.current) setStatus('error');
    }
  }, [siteId, updateSite]);

  useEffect(() => {
    if (legal === saved.current) return;
    setStatus('saving');
    const timer = setTimeout(() => void save(), LEGAL_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [legal, save]);

  const retry = useCallback(() => void save(), [save]);

  return { status, retry };
}
