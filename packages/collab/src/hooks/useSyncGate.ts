import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { type Doc } from 'yjs';

const SYNC_TIMEOUT_MS = 8000;

export type SyncGate = 'waiting' | 'ready' | 'unavailable';

/** Has this doc ever received an update — from the server or the local cache? */
export function hasLocalState(ydoc: Doc | null): boolean {
  return !!ydoc && ydoc.store.clients.size > 0;
}

export function syncGateState(s: {
  hasProvider: boolean;
  isSynced: boolean;
  syncTimedOut: boolean;
  isLocalLoaded: boolean;
  hasLocalState: boolean;
}): SyncGate {
  if (!s.hasProvider) return 'waiting';
  if (s.isSynced) return 'ready';
  if (!s.syncTimedOut || !s.isLocalLoaded) return 'waiting';
  return s.hasLocalState ? 'ready' : 'unavailable';
}

/**
 * 'ready' once the collaborative editor is safe to mount: either the initial
 * Yjs server sync has completed, or a timeout elapsed (offline / slow server)
 * and the local cache holds a copy to fall back to. Mounting the BlockNote /
 * y-prosemirror binding before this gate causes a "nodeSize undefined" desync
 * crash when the first authoritative server state restructures the doc.
 *
 * 'unavailable' when the timeout elapsed with no local copy (first open on
 * this device): an editable blank doc would be merged into the real one on
 * reconnect. It turns 'ready' by itself once the server syncs.
 */
export function useSyncGate(
  provider: HocuspocusProvider | null,
  isSynced: boolean,
  ydoc: Doc | null,
  isLocalLoaded: boolean
): SyncGate {
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  useEffect(() => {
    if (!provider || isSynced || syncTimedOut) return;
    const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, isSynced, syncTimedOut]);
  return syncGateState({
    hasProvider: !!provider,
    isSynced,
    syncTimedOut,
    isLocalLoaded,
    hasLocalState: hasLocalState(ydoc),
  });
}
