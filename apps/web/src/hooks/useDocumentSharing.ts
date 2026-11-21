import { useCollabDocSharing, type CollabShareApiClient } from '@gruenerator/docs';
import { ApiError } from '@gruenerator/shared/api';
import { type QueryKey } from '@tanstack/react-query';
import axios from 'axios';

import apiClient from '../components/utils/apiClient';

export type {
  SharingCollaborator,
  SharingShareSettings,
  SharingUserGroup,
  SharingGroupShare,
} from '@gruenerator/docs';

/**
 * Axios-Fehler wie der Docs-Client als `ApiError` mit Status und dem Satz des
 * Servers — sonst zeigte der Teilen-Dialog „Request failed with status code 403“.
 */
async function call<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await request()).data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const body = error.response.data as { error?: unknown; message?: unknown } | undefined;
      const text = body?.error ?? body?.message;
      throw new ApiError(
        error.response.status,
        typeof text === 'string' && text ? text : error.message
      );
    }
    throw error;
  }
}

/** Adapts the apps/web axios client to the minimal client the shared hook needs. */
const collabShareClient: CollabShareApiClient = {
  get: <T>(url: string) => call(() => apiClient.get<T>(url)),
  post: <T>(url: string, data?: unknown) => call(() => apiClient.post<T>(url, data)),
  put: <T>(url: string, data?: unknown) => call(() => apiClient.put<T>(url, data)),
  delete: <T>(url: string) => call(() => apiClient.delete<T>(url)),
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
