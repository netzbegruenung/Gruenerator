import { useMemo } from 'react';

import { webAppDocsAdapter } from '../features/docs/docsAdapter';

import type { CollaborationConfig } from '@gruenerator/collab';

export function useCollaborationConfig(): CollaborationConfig {
  return useMemo(
    () => ({
      url: webAppDocsAdapter.getHocuspocusUrl(),
      getToken: () => webAppDocsAdapter.getHocuspocusToken(),
      getWebSocketPolyfill: webAppDocsAdapter.getWebSocketPolyfill,
    }),
    []
  );
}
