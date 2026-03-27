import { useMemo } from 'react';
import {
  useCollaboration as useCollaborationBase,
  type CollaborationConfig,
} from '@gruenerator/collab';
import { useDocsAdapter } from '../context/DocsContext';

export type { UseCollaborationOptions } from '@gruenerator/collab';

export interface UseDocsCollaborationOptions {
  documentId: string;
  user: { id: string; display_name?: string; email?: string } | null;
  isGuest?: boolean;
  guestId?: string;
  guestName?: string;
}

export const useCollaboration = ({
  documentId,
  user,
  isGuest,
  guestId,
  guestName,
}: UseDocsCollaborationOptions) => {
  const adapter = useDocsAdapter();

  const config: CollaborationConfig = useMemo(
    () => ({
      url: adapter.getHocuspocusUrl(),
      getToken: () => adapter.getHocuspocusToken(),
      getWebSocketPolyfill: adapter.getWebSocketPolyfill,
    }),
    [adapter]
  );

  return useCollaborationBase({
    documentId,
    user,
    config,
    isGuest,
    guestId,
    guestName,
  });
};
