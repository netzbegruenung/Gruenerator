'use client';

import { useAui } from '@assistant-ui/react';
import { subscribeServerRestart } from '@gruenerator/shared/api';
import { useEffect } from 'react';

import { subscribeThreadListReload } from './GrueneratorThreadListAdapter';

/**
 * Re-runs the thread list when a host asks via `requestThreadListReload()` (e.g. after a
 * Papierkorb restore), and when the backend is back after a restart — the list that loaded
 * during the restart fell back to empty.
 */
export function ThreadListReloadListener() {
  const aui = useAui();

  useEffect(() => subscribeThreadListReload(() => void aui.threads.reload()), [aui]);
  useEffect(
    () =>
      subscribeServerRestart((restarting) => {
        if (!restarting) void aui.threads.reload();
      }),
    [aui]
  );

  return null;
}
