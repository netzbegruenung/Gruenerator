'use client';

import { useAui } from '@assistant-ui/react';
import { useEffect } from 'react';

import { subscribeThreadListReload } from './GrueneratorThreadListAdapter';

/** Re-runs the thread list when a host asks via `requestThreadListReload()` (e.g. after a Papierkorb restore). */
export function ThreadListReloadListener() {
  const aui = useAui();

  useEffect(() => subscribeThreadListReload(() => void aui.threads.reload()), [aui]);

  return null;
}
