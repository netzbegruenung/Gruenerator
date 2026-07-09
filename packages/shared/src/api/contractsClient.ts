/**
 * Typed ts-rest API client built on top of the existing axios client.
 *
 * Instead of calling `apiClient.get<SomeType>('/api/...')` with a manually
 * maintained type annotation, use the generated client here:
 *
 *   const client = getContractsClient();
 *   const { body, status } = await client.threads.list({ query: {} });
 *   // body is fully typed as z.infer<typeof threadListResponseSchema>
 *
 * The client is lazy-initialised and reuses the same global axios instance
 * that is already set up with auth interceptors. No new axios config needed.
 *
 * NOTE: This file uses `@ts-rest/core` (fetch-based). We adapt the axios
 * client as the underlying fetcher so we inherit auth, 401 handling, and
 * retry logic from the existing interceptors.
 */

import {
  threadsContract,
  exportsContract,
  recentValuesContract,
  itemUsageContract,
  searchContract,
  researchContract,
  boardsContract,
  sheetsContract,
  presentationsContract,
  boardCommentsContract,
  boardAgentContract,
  boardActivityContract,
  boardSubscriptionsContract,
  boardSchedulesContract,
  boardAttachmentsContract,
  boardCardDocumentsContract,
  publicBoardsContract,
  notebookContract,
  notebookCollectionsContract,
  wolkePendingContract,
  notebookSharingContract,
  wordpressContract,
  transferContract,
  notificationsContract,
  emailContract,
  modelPreferencesContract,
  imageModelPreferenceContract,
  imageEditContract,
  adminVorlagenContract,
  userTemplatesContract,
  templateInteractionsContract,
  userAgentsContract,
  userAgentsSharingContract,
  docsContract,
  documentsContract,
  groupsContract,
  userProfileContract,
  canvasContract,
  monitorContract,
  sitesContract,
  subtitlerContract,
  reisekostenContract,
} from '@gruenerator/contracts';
import { initClient } from '@ts-rest/core';
import { isAxiosError } from 'axios';

import { getGlobalApiClient } from './client.js';

// ── Axios-backed fetch adapter ───────────────────────────────────────────────

/**
 * Paths whose 2xx response is binary (Blob) rather than JSON. ts-rest has no
 * way to declare response content-type in the contract, so we maintain this
 * set manually and pass responseType:'blob' to axios for matches. Without
 * this, axios would try to JSON-parse the binary body and corrupt it.
 */
const BINARY_RESPONSE_PATHS = new Set<string>(['/api/exports/docx', '/api/exports/pdf']);

/**
 * Strip the leading `/api` from a contract path so it's relative to the
 * axios client's `baseURL` (which on production is already `/api` — set
 * via `VITE_API_BASE_URL`). In dev, `baseURL` is the Vite proxy origin
 * and also serves `/api/*` via the proxy, so relative paths work there
 * too.
 *
 * **Why contracts ship with `/api/...` absolute paths**: the contracts
 * are authoritative documentation of the REST surface — external tools
 * (curl, Postman, future non-axios clients, OpenAPI export) need the
 * full path. Only this axios bridge has the baseURL convention to
 * reconcile with, so this is the single place the prefix is stripped.
 *
 * Pre-2026-04-13 bug: the bridge didn't strip, so `baseURL + path`
 * concatenated to `/api/api/...` and every typed hook 404'd in
 * production. Dev happened to work because `baseURL` was `''`
 * there (no VITE_API_BASE_URL set), which masked the issue through
 * 4 sessions of contract migration.
 */
function stripApiPrefix(path: string): string {
  return path.startsWith('/api/') ? path.slice(4) : path;
}

/**
 * ts-rest requires a fetch-compatible function. We bridge to axios so that
 * the existing interceptors (auth token injection, 401 redirect, retry) are
 * preserved transparently.
 */
async function axiosFetcher({
  path,
  method,
  headers,
  body,
}: {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}): Promise<{ status: number; body: unknown; headers: Headers }> {
  const axios = getGlobalApiClient();
  const isBinary = BINARY_RESPONSE_PATHS.has(path);
  // Strip `/api` because the axios client's baseURL already includes it.
  // Keep the original `path` for the BINARY_RESPONSE_PATHS check above so
  // the set keeps using the canonical contract paths.
  const relativePath = stripApiPrefix(path);

  const response = await axios
    .request({
      url: relativePath,
      method,
      headers,
      data: body,
      // Let axios resolve with the full response on 4xx/5xx so ts-rest can
      // match the status to the contract's response map — EXCEPT 401. The
      // global session handling (probe → transparent retry, or login
      // redirect + auth-cache wipe) lives in the shared client's *error*
      // interceptor, which only runs on rejected promises. Resolving 401s
      // here silently disabled logout for every contract-based endpoint:
      // the session died server-side but the app kept rendering the
      // authenticated shell ("half logged in").
      validateStatus: (status) => status !== 401,
      ...(isBinary && { responseType: 'blob' as const }),
    })
    .catch((error: unknown) => {
      // The error interceptor has already run (session probe, possible
      // redirect). If the server answered, hand the response to ts-rest
      // unchanged so callers keep receiving `{ status: 401, body }` exactly
      // as before instead of a thrown AxiosError.
      if (isAxiosError(error) && error.response) return error.response;
      throw error;
    });

  // Convert axios headers (AxiosResponseHeaders) to native Headers
  const nativeHeaders = new Headers();
  for (const [key, value] of Object.entries(response.headers as Record<string, string>)) {
    if (value !== undefined) nativeHeaders.set(key, String(value));
  }

  return {
    status: response.status,
    body: response.data,
    headers: nativeHeaders,
  };
}

// ── Client factory helpers ────────────────────────────────────────────────────

const CLIENT_OPTS = {
  baseUrl: '',
  api: axiosFetcher,
} as const;

// Infer types directly from initClient — avoids importing InitClientReturn
// which may not be exported in all @ts-rest/core minor versions.
const _threadsClient = () => initClient(threadsContract, CLIENT_OPTS);
const _exportsClient = () => initClient(exportsContract, CLIENT_OPTS);
const _recentValuesClient = () => initClient(recentValuesContract, CLIENT_OPTS);
const _itemUsageClient = () => initClient(itemUsageContract, CLIENT_OPTS);
const _searchClient = () => initClient(searchContract, CLIENT_OPTS);
const _researchClient = () => initClient(researchContract, CLIENT_OPTS);
const _boardsClient = () => initClient(boardsContract, CLIENT_OPTS);
const _sheetsClient = () => initClient(sheetsContract, CLIENT_OPTS);
const _presentationsClient = () => initClient(presentationsContract, CLIENT_OPTS);
const _boardCommentsClient = () => initClient(boardCommentsContract, CLIENT_OPTS);
const _boardAgentClient = () => initClient(boardAgentContract, CLIENT_OPTS);
const _boardActivityClient = () => initClient(boardActivityContract, CLIENT_OPTS);
const _boardSubscriptionsClient = () => initClient(boardSubscriptionsContract, CLIENT_OPTS);
const _boardSchedulesClient = () => initClient(boardSchedulesContract, CLIENT_OPTS);
const _boardAttachmentsClient = () => initClient(boardAttachmentsContract, CLIENT_OPTS);
const _boardCardDocumentsClient = () => initClient(boardCardDocumentsContract, CLIENT_OPTS);
const _publicBoardsClient = () => initClient(publicBoardsContract, CLIENT_OPTS);
const _notebookClient = () => initClient(notebookContract, CLIENT_OPTS);
const _notebookCollectionsClient = () => initClient(notebookCollectionsContract, CLIENT_OPTS);
const _wolkePendingClient = () => initClient(wolkePendingContract, CLIENT_OPTS);
const _notebookSharingClient = () => initClient(notebookSharingContract, CLIENT_OPTS);
const _wordpressClient = () => initClient(wordpressContract, CLIENT_OPTS);
const _transferClient = () => initClient(transferContract, CLIENT_OPTS);
const _notificationsClient = () => initClient(notificationsContract, CLIENT_OPTS);
const _emailClient = () => initClient(emailContract, CLIENT_OPTS);
const _modelPreferencesClient = () => initClient(modelPreferencesContract, CLIENT_OPTS);
const _imageModelPreferenceClient = () => initClient(imageModelPreferenceContract, CLIENT_OPTS);
const _imageEditClient = () => initClient(imageEditContract, CLIENT_OPTS);
const _adminVorlagenClient = () => initClient(adminVorlagenContract, CLIENT_OPTS);
const _userTemplatesClient = () => initClient(userTemplatesContract, CLIENT_OPTS);
const _templateInteractionsClient = () => initClient(templateInteractionsContract, CLIENT_OPTS);
const _userAgentsClient = () => initClient(userAgentsContract, CLIENT_OPTS);
const _userAgentsSharingClient = () => initClient(userAgentsSharingContract, CLIENT_OPTS);
const _docsClient = () => initClient(docsContract, CLIENT_OPTS);
const _documentsClient = () => initClient(documentsContract, CLIENT_OPTS);
const _groupsClient = () => initClient(groupsContract, CLIENT_OPTS);
const _userProfileClient = () => initClient(userProfileContract, CLIENT_OPTS);
const _canvasClient = () => initClient(canvasContract, CLIENT_OPTS);
const _monitorClient = () => initClient(monitorContract, CLIENT_OPTS);
const _sitesClient = () => initClient(sitesContract, CLIENT_OPTS);
const _subtitlerClient = () => initClient(subtitlerContract, CLIENT_OPTS);
const _reisekostenClient = () => initClient(reisekostenContract, CLIENT_OPTS);

export interface ContractsClient {
  threads: ReturnType<typeof _threadsClient>;
  exports: ReturnType<typeof _exportsClient>;
  recentValues: ReturnType<typeof _recentValuesClient>;
  itemUsage: ReturnType<typeof _itemUsageClient>;
  search: ReturnType<typeof _searchClient>;
  research: ReturnType<typeof _researchClient>;
  boards: ReturnType<typeof _boardsClient>;
  sheets: ReturnType<typeof _sheetsClient>;
  presentations: ReturnType<typeof _presentationsClient>;
  boardComments: ReturnType<typeof _boardCommentsClient>;
  boardAgent: ReturnType<typeof _boardAgentClient>;
  boardActivity: ReturnType<typeof _boardActivityClient>;
  boardSubscriptions: ReturnType<typeof _boardSubscriptionsClient>;
  boardSchedules: ReturnType<typeof _boardSchedulesClient>;
  boardAttachments: ReturnType<typeof _boardAttachmentsClient>;
  boardCardDocuments: ReturnType<typeof _boardCardDocumentsClient>;
  publicBoards: ReturnType<typeof _publicBoardsClient>;
  notebook: ReturnType<typeof _notebookClient>;
  notebookCollections: ReturnType<typeof _notebookCollectionsClient>;
  wolkePending: ReturnType<typeof _wolkePendingClient>;
  notebookSharing: ReturnType<typeof _notebookSharingClient>;
  wordpress: ReturnType<typeof _wordpressClient>;
  transfer: ReturnType<typeof _transferClient>;
  notifications: ReturnType<typeof _notificationsClient>;
  email: ReturnType<typeof _emailClient>;
  modelPreferences: ReturnType<typeof _modelPreferencesClient>;
  imageModelPreference: ReturnType<typeof _imageModelPreferenceClient>;
  imageEdit: ReturnType<typeof _imageEditClient>;
  adminVorlagen: ReturnType<typeof _adminVorlagenClient>;
  userTemplates: ReturnType<typeof _userTemplatesClient>;
  templateInteractions: ReturnType<typeof _templateInteractionsClient>;
  userAgents: ReturnType<typeof _userAgentsClient>;
  userAgentsSharing: ReturnType<typeof _userAgentsSharingClient>;
  docs: ReturnType<typeof _docsClient>;
  documents: ReturnType<typeof _documentsClient>;
  groups: ReturnType<typeof _groupsClient>;
  userProfile: ReturnType<typeof _userProfileClient>;
  canvas: ReturnType<typeof _canvasClient>;
  monitor: ReturnType<typeof _monitorClient>;
  sites: ReturnType<typeof _sitesClient>;
  subtitler: ReturnType<typeof _subtitlerClient>;
  reisekosten: ReturnType<typeof _reisekostenClient>;
}

// ── Lazy singleton ────────────────────────────────────────────────────────────

let _client: ContractsClient | null = null;

/**
 * Returns the typed contracts client, creating it on first call.
 * The axios global client must be initialised before calling this
 * (i.e. after `setGlobalApiClient()` has been called).
 *
 * The `baseUrl` is intentionally empty — all paths in the contracts are
 * already absolute (e.g. `/api/chat-service/threads`), and the axios
 * instance already has the correct baseURL configured.
 */
export function getContractsClient(): ContractsClient {
  if (_client) return _client;

  _client = {
    threads: _threadsClient(),
    exports: _exportsClient(),
    recentValues: _recentValuesClient(),
    itemUsage: _itemUsageClient(),
    search: _searchClient(),
    research: _researchClient(),
    boards: _boardsClient(),
    sheets: _sheetsClient(),
    presentations: _presentationsClient(),
    boardComments: _boardCommentsClient(),
    boardAgent: _boardAgentClient(),
    boardActivity: _boardActivityClient(),
    boardSubscriptions: _boardSubscriptionsClient(),
    boardSchedules: _boardSchedulesClient(),
    boardAttachments: _boardAttachmentsClient(),
    boardCardDocuments: _boardCardDocumentsClient(),
    publicBoards: _publicBoardsClient(),
    notebook: _notebookClient(),
    notebookCollections: _notebookCollectionsClient(),
    wolkePending: _wolkePendingClient(),
    notebookSharing: _notebookSharingClient(),
    wordpress: _wordpressClient(),
    transfer: _transferClient(),
    notifications: _notificationsClient(),
    email: _emailClient(),
    modelPreferences: _modelPreferencesClient(),
    imageModelPreference: _imageModelPreferenceClient(),
    imageEdit: _imageEditClient(),
    adminVorlagen: _adminVorlagenClient(),
    userTemplates: _userTemplatesClient(),
    templateInteractions: _templateInteractionsClient(),
    userAgents: _userAgentsClient(),
    userAgentsSharing: _userAgentsSharingClient(),
    docs: _docsClient(),
    documents: _documentsClient(),
    groups: _groupsClient(),
    userProfile: _userProfileClient(),
    canvas: _canvasClient(),
    monitor: _monitorClient(),
    sites: _sitesClient(),
    subtitler: _subtitlerClient(),
    reisekosten: _reisekostenClient(),
  };

  return _client;
}

/**
 * Reset the client singleton — useful in tests or when the axios instance
 * is replaced (e.g. in Storybook / test harnesses).
 */
export function resetContractsClient(): void {
  _client = null;
}
