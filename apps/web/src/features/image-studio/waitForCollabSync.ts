import { type HocuspocusProvider } from '@hocuspocus/provider';

type SyncingProvider = Pick<HocuspocusProvider, 'hasUnsyncedChanges' | 'on' | 'off'>;

/**
 * Resolves once the server has acked every local update, or after
 * `timeoutMs` — whichever comes first. Offline, nothing will ack; the
 * timeout keeps leaving the editor from hanging on that.
 */
export function waitForCollabSync(
  provider: SyncingProvider | null,
  timeoutMs: number
): Promise<void> {
  if (!provider?.hasUnsyncedChanges) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      provider.off('unsyncedChanges', onChange);
      resolve();
    };
    const onChange = () => {
      if (!provider.hasUnsyncedChanges) done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    provider.on('unsyncedChanges', onChange);
  });
}
