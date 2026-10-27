'use client';

import { useAuiState } from '@assistant-ui/react';
import { useEffect, useMemo } from 'react';

import { createChatApiClient } from '../context/ChatContext';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';
import { fetchThreadTabularFiles, usePythonFileStore } from '../stores/pythonFileStore';

/**
 * Loads the per-thread side data (compaction state, thread settings, tabular
 * files for the in-browser interpreter) whenever the active thread settles.
 *
 * This used to live inside `history.load()`, which is the wrong hook for it in
 * two ways. `load()` runs exactly once per thread runtime instance and those
 * instances outlive a switch, so returning to a thread never re-ran it — the
 * compaction banner and the interpreter's `df` were gone on every revisit,
 * because `setCurrentThread` resets/clears both on the way in. And `load()` has
 * no idea whether its thread won the switch race, so a slow response from the
 * thread the user just left overwrote the state of the one they landed on.
 *
 * Keyed on the settled main thread instead, it runs on every switch and every
 * revisit, and each write re-checks that its thread is still the current one.
 */
export function ThreadDataSyncEffect() {
  const mainRemoteId = useAuiState(
    (s) => s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.remoteId ?? null
  );
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  useEffect(() => {
    if (!mainRemoteId) return;
    let cancelled = false;
    const store = useAgentStore.getState();

    void store.loadCompactionState(mainRemoteId, apiClient);
    void store.loadThreadSettings(mainRemoteId, apiClient);

    // Rehydrate the in-browser pandas interpreter: setCurrentThread() cleared
    // the tabular file store, so re-fetch this thread's persisted spreadsheet
    // bytes — otherwise "Ausführen" on a reopened thread has no `df`.
    // Best-effort; on failure the user just re-attaches the file.
    void (async () => {
      try {
        const files = await fetchThreadTabularFiles(apiClient, mainRemoteId);
        // The user may have switched away while this was in flight — dropping
        // the old thread's spreadsheets into the new one is worse than none.
        if (cancelled || useAgentStore.getState().currentThreadId !== mainRemoteId) return;
        const fileStore = usePythonFileStore.getState();
        for (const f of files) fileStore.setFile(f);
      } catch (err) {
        console.warn('[ThreadDataSync] Tabular file rehydration failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainRemoteId, apiClient]);

  return null;
}
