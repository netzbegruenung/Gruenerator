import { type SyncGate, useCollaboration, useSyncGate } from '@gruenerator/collab';
import { isSiteDocSeeded } from '@gruenerator/contracts/site-ydoc';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';

import { useAuth, useSitesCollaboration } from '../SitesContext';
import { usePrepareSiteDraft } from '../hooks/useSite';

export type SaveStatus = 'saved' | 'saving' | 'offline';

export type DraftSession =
  | { state: 'preparing' }
  | { state: 'connecting' }
  | { state: 'error'; retry: () => void }
  | { state: 'unavailable'; retry: () => void }
  | { state: 'tooLarge' }
  | { state: 'ready'; ydoc: Y.Doc; provider: HocuspocusProvider; save: SaveStatus };

export const DRAFT_TOO_LARGE_CLOSE_CODE = 4413;
const MAX_CONNECT_ATTEMPTS = 3;

export function sessionState(i: {
  prepare: 'pending' | 'error' | 'done';
  gate: SyncGate;
  seeded: boolean;
  tooLarge?: boolean;
}): DraftSession['state'] {
  if (i.tooLarge) return 'tooLarge';
  if (i.prepare === 'pending') return 'preparing';
  if (i.prepare === 'error') return 'error';
  if (i.gate === 'unavailable') return 'unavailable';
  if (i.gate === 'waiting') return 'connecting';
  return i.seeded ? 'ready' : 'error';
}

export function saveStatus(i: { isConnected: boolean; unsyncedChanges: number }): SaveStatus {
  if (!i.isConnected) return 'offline';
  return i.unsyncedChanges > 0 ? 'saving' : 'saved';
}

export function useSiteDraftSession(siteId: string): DraftSession {
  const { user } = useAuth();
  const config = useSitesCollaboration();
  const prepareDraft = usePrepareSiteDraft();

  const [attempt, setAttempt] = useState(0);
  const [prepare, setPrepare] = useState<{ attempt: number; status: 'pending' | 'error' | 'done' }>(
    {
      attempt: 0,
      status: 'pending',
    }
  );
  const [tooLarge, setTooLarge] = useState(false);
  const [authExhausted, setAuthExhausted] = useState(false);
  const connectAttempts = useRef(0);

  useEffect(() => {
    let ignore = false;
    setPrepare({ attempt, status: 'pending' });
    prepareDraft(siteId).then(
      () => {
        if (!ignore) setPrepare({ attempt, status: 'done' });
      },
      () => {
        if (!ignore) setPrepare({ attempt, status: 'error' });
      }
    );
    return () => {
      ignore = true;
    };
  }, [siteId, attempt, prepareDraft]);

  const prepared = prepare.attempt === attempt && prepare.status === 'done';
  const { ydoc, provider, isConnected, isSynced, isLocalLoaded } = useCollaboration({
    documentId: prepared ? `site-${siteId}` : '',
    user: user ? { id: user.id, display_name: user.display_name, email: user.email } : null,
    config,
  });

  const [unsynced, setUnsynced] = useState(0);
  useEffect(() => {
    if (!provider) return;
    const update = () => setUnsynced(provider.unsyncedChanges);
    update();
    provider.on('unsyncedChanges', update);
    return () => {
      provider.off('unsyncedChanges', update);
    };
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    const onClose = ({ event }: { event: { code: number } }) => {
      if (event.code !== DRAFT_TOO_LARGE_CLOSE_CODE) return;
      setTooLarge(true);
      provider.disconnect();
    };
    provider.on('close', onClose);
    return () => {
      provider.off('close', onClose);
    };
  }, [provider]);

  // A refusal carries no reason. The room refuses an unseeded draft, so prepare again and
  // reconnect, a bounded number of times.
  useEffect(() => {
    if (!provider) return;
    const onFailed = () => {
      if (connectAttempts.current >= MAX_CONNECT_ATTEMPTS) {
        setAuthExhausted(true);
        return;
      }
      connectAttempts.current += 1;
      setAttempt((n) => n + 1);
    };
    const onSynced = () => {
      connectAttempts.current = 0;
    };
    provider.on('authenticationFailed', onFailed);
    provider.on('synced', onSynced);
    return () => {
      provider.off('authenticationFailed', onFailed);
      provider.off('synced', onSynced);
    };
  }, [provider]);

  const gate = useSyncGate(provider, isSynced, ydoc, isLocalLoaded);
  const retry = useCallback(() => {
    connectAttempts.current = 0;
    setTooLarge(false);
    setAuthExhausted(false);
    setAttempt((n) => n + 1);
  }, []);

  const state = sessionState({
    prepare: authExhausted
      ? 'error'
      : prepared
        ? 'done'
        : prepare.status === 'error' && prepare.attempt === attempt
          ? 'error'
          : 'pending',
    gate: provider && prepared ? gate : 'waiting',
    seeded: isSiteDocSeeded(ydoc),
    tooLarge,
  });

  switch (state) {
    case 'ready':
      return provider
        ? { state, ydoc, provider, save: saveStatus({ isConnected, unsyncedChanges: unsynced }) }
        : { state: 'connecting' };
    case 'error':
    case 'unavailable':
      return { state, retry };
    case 'tooLarge':
      return { state };
    default:
      return { state };
  }
}
