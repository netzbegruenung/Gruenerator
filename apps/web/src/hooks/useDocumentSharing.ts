import { useCollabDocSharing, type CollabShareApiClient } from '@gruenerator/docs';
import { type QueryKey } from '@tanstack/react-query';

import apiClient from '../components/utils/apiClient';

export type {
  SharingCollaborator,
  SharingShareSettings,
  SharingUserGroup,
  SharingGroupShare,
} from '@gruenerator/docs';

/** Adapts the apps/web axios client to the minimal client the shared hook needs. */
const collabShareClient: CollabShareApiClient = {
  get: async <T>(url: string) => (await apiClient.get<T>(url)).data,
  post: async <T>(url: string, data?: unknown) => (await apiClient.post<T>(url, data)).data,
  put: async <T>(url: string, data?: unknown) => (await apiClient.put<T>(url, data)).data,
  delete: async <T>(url: string) => (await apiClient.delete<T>(url)).data,
};

interface UseDocumentSharingOptions {
  /** Cache-key namespace, e.g. 'docs', 'canvas'. Used to scope React-Query keys. */
  namespace: string;
  /** Additional QueryKeys to invalidate alongside the standard three (boards needs assignable-members). */
  extraInvalidationKeys?: QueryKey[];
}

/**
 * apps/web binding of the shared collab-document sharing hook — supplies the
 * axios client; everything else lives in @gruenerator/docs (collab-share).
 */
export const useDocumentSharing = (
  documentId: string,
  { namespace, extraInvalidationKeys }: UseDocumentSharingOptions
) =>
  useCollabDocSharing(documentId, {
    namespace,
    apiClient: collabShareClient,
    ...(extraInvalidationKeys ? { extraInvalidationKeys } : {}),
  });
