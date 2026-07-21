import { useChatConfigStore, createChatApiClient, type ChatApiClient } from '@gruenerator/chat';
import { router } from 'expo-router';

import { getErrorMessage } from '../utils/errors';

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu';

let cachedApiClient: ChatApiClient | null = null;

async function mobileFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await secureStorage.getToken();
  const absoluteUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  return fetch(absoluteUrl, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function mobileOnUnauthorized(): void {
  console.warn('[ChatConfig] Unauthorized — session gone, user will be routed to login');
}

/**
 * "Als Dokument speichern" from chat (e.g. the research card). Mirrors web's
 * onEditInDocs: the server-authoritative POST /docs/from-export converts the
 * markdown, creates the collaborative document and seeds its Yjs state; we then
 * open it by id in the mobile doc editor, which hydrates the seeded content over
 * the same Hocuspocus server as web. Content is never passed through the route —
 * only the document id, exactly like web.
 */
async function mobileEditInDocs(
  content: string,
  title?: string,
  existingDocId?: string
): Promise<string | void> {
  const openDoc = (id: string) => {
    router.push({ pathname: '/(fullscreen)/doc-editor', params: { id } });
    return id;
  };

  if (existingDocId) {
    return openDoc(existingDocId);
  }

  try {
    const { exportToDocs } = useChatConfigStore.getState().endpoints;
    const response = await mobileFetch(exportToDocs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, documentType: 'chat-response' }),
    });
    if (!response.ok) throw new Error(`Export failed (${response.status})`);
    const data = (await response.json()) as { documentId?: string };
    if (data.documentId) {
      return openDoc(data.documentId);
    }
  } catch (error: unknown) {
    console.error('[ChatConfig] Export to docs failed:', getErrorMessage(error));
    throw error;
  }
}

export function configureMobileChat(): void {
  useChatConfigStore.getState().configure({
    fetch: mobileFetch,
    onUnauthorized: mobileOnUnauthorized,
    docsBaseUrl: 'https://gruenerator.eu',
    onEditInDocs: mobileEditInDocs,
    platform: 'app',
  });
  cachedApiClient = null;
}

export function getMobileChatApiClient(): ChatApiClient {
  if (!cachedApiClient) {
    const { fetch: fetchFn, onUnauthorized } = useChatConfigStore.getState();
    cachedApiClient = createChatApiClient(fetchFn, onUnauthorized);
  }
  return cachedApiClient;
}
