import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';

const SYNC_TIMEOUT_MS = 8000;

/**
 * Returns true once the collaborative editor is safe to mount: either the
 * initial Yjs server sync has completed, or a timeout elapsed (offline / slow
 * server — fall back to whatever local state exists). Mounting the BlockNote /
 * y-prosemirror binding before this gate causes a "nodeSize undefined" desync
 * crash when the first authoritative server state restructures the doc.
 */
export function useSyncGate(provider: HocuspocusProvider | null, isSynced: boolean): boolean {
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  useEffect(() => {
    if (!provider || isSynced || syncTimedOut) return;
    const timer = setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, isSynced, syncTimedOut]);
  return !!provider && (isSynced || syncTimedOut);
}
