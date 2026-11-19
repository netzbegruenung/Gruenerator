import { type HocuspocusProvider } from '@hocuspocus/provider';

export class SyncTimeoutError extends Error {
  constructor() {
    super('Der Entwurf wurde nicht rechtzeitig gespeichert');
    this.name = 'SyncTimeoutError';
  }
}

export function waitForSynced(
  provider: Pick<HocuspocusProvider, 'unsyncedChanges' | 'on' | 'off'>,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (provider.unsyncedChanges === 0) {
      resolve();
      return;
    }
    const onChange = () => {
      if (provider.unsyncedChanges !== 0) return;
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new SyncTimeoutError());
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      provider.off('unsyncedChanges', onChange);
    }
    provider.on('unsyncedChanges', onChange);
  });
}
