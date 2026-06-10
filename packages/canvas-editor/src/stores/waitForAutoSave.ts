import type { AutoSaveStore, AutoSaveStoreApi } from './createAutoSaveStore';

/**
 * Wait until the auto-save store reaches a terminal state: resolves on
 * 'saved' with a share token, rejects on 'error'. Bounded by a timeout so
 * callers never hang when the save silently stalls (e.g. autosave disabled,
 * image deduped, or the API returned no token).
 */
export function waitForAutoSave(
  autoSaveStoreApi: AutoSaveStoreApi,
  timeoutMs = 15_000
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settle = (s: AutoSaveStore) => {
      if (s.autoSaveStatus === 'saved' && s.autoSavedShareToken) {
        cleanup();
        resolve();
      } else if (s.autoSaveStatus === 'error') {
        cleanup();
        reject(new Error('Auto-save failed'));
      }
    };
    const unsub = autoSaveStoreApi.subscribe(settle);
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('Auto-save timeout'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(deadline);
      unsub();
    };
    settle(autoSaveStoreApi.getState());
  });
}
