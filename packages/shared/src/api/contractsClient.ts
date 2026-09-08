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
  recentActivityContract,
  contentContract,
  itemUsageContract,
  userUsageContract,
  transparencyContract,
  globalSearchContract,
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
  notebookWordpressContract,
  userWebsitesContract,
  letterheadsContract,
  notebookSharingContract,
  notificationsContract,
  memoryContract,
  emailContract,
  feedbackContract,
  modelPreferencesContract,
  imageModelPreferenceContract,
  mcpServersContract,
  chatToolApprovalsContract,
  imageEditContract,
  sharepicTextContract,
  adminVorlagenContract,
  userTemplatesContract,
  sharedTemplateContract,
  templateInteractionsContract,
  userAgentsContract,
  userAgentsSharingContract,
  skillPromptContract,
  agentVisibilityContract,
  chunkInspectorContract,
  skillVisibilityContract,
  instanceAdminOverviewContract,
  lvAdminAssignmentContract,
  landesverbandAdminContract,
  userTextFormsContract,
  recurringTasksContract,
  docsContract,
  documentsContract,
  groupsContract,
  userProfileContract,
  canvasContract,
  canvasAiContract,
  monitorContract,
  sitesContract,
  texteContract,
  subtitlerContract,
  reisekostenContract,
  imagePickerContract,
  sharesReadContract,
  promptsContract,
} from '@gruenerator/contracts';
import { initClient, isZodType, type AppRoute } from '@ts-rest/core';
import { AxiosError, isAxiosError } from 'axios';

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
 *
 * Exported because the same reconciliation is needed anywhere a path written
 * for a base-less client is handed to an axios client whose `baseURL` already
 * ends in `/api` — mobile's mentionable sync is the second such bridge.
 */
export function stripApiPrefix(path: string): string {
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
  route,
  validateResponse,
}: {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  route: AppRoute;
  validateResponse?: boolean | undefined;
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

  // A request the browser tore down (page reload/navigation while it was in
  // flight) ends with status 0. axios `settle()` resolves any response whose
  // status is falsy without consulting `validateStatus` above, so it would
  // arrive here looking like an HTTP answer. No contract declares status 0,
  // and callers treat "not 200" as a generic failure — turning a network
  // drop into an unclassified error that toastApiError then reports to
  // Sentry (GlitchTip #576). Reject it the way axios itself rejects a network
  // error, so the retry predicate and error dictionary recognise it.
  if (response.status === 0) {
    throw new AxiosError(
      'Network Error',
      AxiosError.ERR_NETWORK,
      response.config,
      response.request
    );
  }

  // Convert axios headers (AxiosResponseHeaders) to native Headers
  const nativeHeaders = new Headers();
  for (const [key, value] of Object.entries(response.headers as Record<string, string>)) {
    if (value !== undefined) nativeHeaders.set(key, String(value));
  }

  // ts-rest only applies `validateResponse` inside its own `tsRestFetchApi`.
  // Handing it a custom `api` — which is the whole point of this bridge — skips
  // that step, so setting the flag on a client did exactly nothing until this
  // block existed. Verified by `contractsClientValidation.vitest.ts`, whose
  // regression case passed happily while the flag was set but inert.
  // `route.validateResponseOnClient` is ts-rest's deprecated per-route opt-in.
  // Nothing in this repo sets it, but honouring it here costs one `??` and
  // avoids re-creating exactly the trap above: a flag that type-checks, reads
  // as enabled, and is silently ignored by this bridge.
  if (validateResponse ?? route.validateResponseOnClient) {
    const responseSchema = route.responses[response.status];
    if (isZodType(responseSchema)) {
      return {
        status: response.status,
        body: responseSchema.parse(response.data),
        headers: nativeHeaders,
      };
    }
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

/**
 * Same client, but the 200 body is parsed against the contract's Zod schema
 * before it is handed back — a mismatch throws a `ZodError` naming the field.
 *
 * The reason is the mobile Studio tab: it once died with `undefined is not a
 * function` deep inside a render because `/share/recent` shipped `createdAt: {}`
 * and nothing between the response and the sort had any opinion about the shape.
 * Validation is that missing opinion.
 *
 * The *effect* is wider than that reason, and deliberately so. These are
 * process-wide singletons, so switching them on validates every caller of the
 * three contracts — `canvas` also serves the collab canvas editor, chat sharepic
 * minting and the template gallery; `subtitler` serves the whole web subtitler
 * pipeline; `sharesRead` also serves share renaming. Those
 * response builders serialize their dates through the same `toIso` pattern, so
 * none of them throws today, but none was audited or covered by a test here
 * either. A drift in one of them now fails loudly instead of silently — which is
 * the point, but it will surface in the web app, not only in the Studio tab.
 *
 * Not switched on globally: every other contract would start throwing on
 * mismatches nobody has audited yet. Widening this is a deliberate, separate
 * step — see the contract-adoption backlog.
 */
const VALIDATED_CLIENT_OPTS = {
  ...CLIENT_OPTS,
  validateResponse: true,
} as const;

// Infer types directly from initClient — avoids importing InitClientReturn
// which may not be exported in all @ts-rest/core minor versions.
const _threadsClient = () => initClient(threadsContract, CLIENT_OPTS);
const _exportsClient = () => initClient(exportsContract, CLIENT_OPTS);
const _recentValuesClient = () => initClient(recentValuesContract, CLIENT_OPTS);
const _recentActivityClient = () => initClient(recentActivityContract, CLIENT_OPTS);
const _contentClient = () => initClient(contentContract, CLIENT_OPTS);
const _itemUsageClient = () => initClient(itemUsageContract, CLIENT_OPTS);
const _userUsageClient = () => initClient(userUsageContract, CLIENT_OPTS);
const _transparencyClient = () => initClient(transparencyContract, CLIENT_OPTS);
const _globalSearchClient = () => initClient(globalSearchContract, CLIENT_OPTS);
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
const _notebookWordpressClient = () => initClient(notebookWordpressContract, CLIENT_OPTS);
const _userWebsitesClient = () => initClient(userWebsitesContract, CLIENT_OPTS);
const _letterheadsClient = () => initClient(letterheadsContract, CLIENT_OPTS);
const _notebookSharingClient = () => initClient(notebookSharingContract, CLIENT_OPTS);
const _notificationsClient = () => initClient(notificationsContract, CLIENT_OPTS);
const _memoryClient = () => initClient(memoryContract, CLIENT_OPTS);
const _emailClient = () => initClient(emailContract, CLIENT_OPTS);
const _feedbackClient = () => initClient(feedbackContract, CLIENT_OPTS);
const _modelPreferencesClient = () => initClient(modelPreferencesContract, CLIENT_OPTS);
const _imageModelPreferenceClient = () => initClient(imageModelPreferenceContract, CLIENT_OPTS);
const _mcpServersClient = () => initClient(mcpServersContract, CLIENT_OPTS);
const _chatToolApprovalsClient = () => initClient(chatToolApprovalsContract, CLIENT_OPTS);
const _imageEditClient = () => initClient(imageEditContract, CLIENT_OPTS);
const _sharepicTextClient = () => initClient(sharepicTextContract, CLIENT_OPTS);
const _adminVorlagenClient = () => initClient(adminVorlagenContract, CLIENT_OPTS);
const _userTemplatesClient = () => initClient(userTemplatesContract, CLIENT_OPTS);
const _sharedTemplateClient = () => initClient(sharedTemplateContract, CLIENT_OPTS);
const _templateInteractionsClient = () => initClient(templateInteractionsContract, CLIENT_OPTS);
const _userAgentsClient = () => initClient(userAgentsContract, CLIENT_OPTS);
const _userAgentsSharingClient = () => initClient(userAgentsSharingContract, CLIENT_OPTS);
const _skillPromptClient = () => initClient(skillPromptContract, CLIENT_OPTS);
const _agentVisibilityClient = () => initClient(agentVisibilityContract, CLIENT_OPTS);
const _chunkInspectorClient = () => initClient(chunkInspectorContract, CLIENT_OPTS);
const _skillVisibilityClient = () => initClient(skillVisibilityContract, CLIENT_OPTS);
const _instanceAdminOverviewClient = () => initClient(instanceAdminOverviewContract, CLIENT_OPTS);
const _lvAdminAssignmentClient = () => initClient(lvAdminAssignmentContract, CLIENT_OPTS);
const _landesverbandAdminClient = () => initClient(landesverbandAdminContract, CLIENT_OPTS);
const _userTextFormsClient = () => initClient(userTextFormsContract, CLIENT_OPTS);
const _recurringTasksClient = () => initClient(recurringTasksContract, CLIENT_OPTS);
const _docsClient = () => initClient(docsContract, CLIENT_OPTS);
const _documentsClient = () => initClient(documentsContract, CLIENT_OPTS);
const _groupsClient = () => initClient(groupsContract, CLIENT_OPTS);
const _userProfileClient = () => initClient(userProfileContract, CLIENT_OPTS);
// Validiert (nicht nur für den Studio-Tab) — siehe VALIDATED_CLIENT_OPTS.
const _canvasClient = () => initClient(canvasContract, VALIDATED_CLIENT_OPTS);
const _canvasAiClient = () => initClient(canvasAiContract, CLIENT_OPTS);
const _monitorClient = () => initClient(monitorContract, CLIENT_OPTS);
const _sitesClient = () => initClient(sitesContract, CLIENT_OPTS);
const _texteClient = () => initClient(texteContract, CLIENT_OPTS);
// Validiert (nicht nur für den Studio-Tab) — siehe VALIDATED_CLIENT_OPTS.
const _subtitlerClient = () => initClient(subtitlerContract, VALIDATED_CLIENT_OPTS);
const _reisekostenClient = () => initClient(reisekostenContract, CLIENT_OPTS);
const _imagePickerClient = () => initClient(imagePickerContract, CLIENT_OPTS);
// Validiert (nicht nur für den Studio-Tab) — siehe VALIDATED_CLIENT_OPTS.
const _sharesReadClient = () => initClient(sharesReadContract, VALIDATED_CLIENT_OPTS);
const _promptsClient = () => initClient(promptsContract, CLIENT_OPTS);

export interface ContractsClient {
  threads: ReturnType<typeof _threadsClient>;
  exports: ReturnType<typeof _exportsClient>;
  recentValues: ReturnType<typeof _recentValuesClient>;
  recentActivity: ReturnType<typeof _recentActivityClient>;
  content: ReturnType<typeof _contentClient>;
  itemUsage: ReturnType<typeof _itemUsageClient>;
  userUsage: ReturnType<typeof _userUsageClient>;
  transparency: ReturnType<typeof _transparencyClient>;
  globalSearch: ReturnType<typeof _globalSearchClient>;
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
  notebookWordpress: ReturnType<typeof _notebookWordpressClient>;
  userWebsites: ReturnType<typeof _userWebsitesClient>;
  letterheads: ReturnType<typeof _letterheadsClient>;
  notebookSharing: ReturnType<typeof _notebookSharingClient>;
  notifications: ReturnType<typeof _notificationsClient>;
  memory: ReturnType<typeof _memoryClient>;
  email: ReturnType<typeof _emailClient>;
  feedback: ReturnType<typeof _feedbackClient>;
  modelPreferences: ReturnType<typeof _modelPreferencesClient>;
  imageModelPreference: ReturnType<typeof _imageModelPreferenceClient>;
  mcpServers: ReturnType<typeof _mcpServersClient>;
  chatToolApprovals: ReturnType<typeof _chatToolApprovalsClient>;
  imageEdit: ReturnType<typeof _imageEditClient>;
  sharepicText: ReturnType<typeof _sharepicTextClient>;
  adminVorlagen: ReturnType<typeof _adminVorlagenClient>;
  userTemplates: ReturnType<typeof _userTemplatesClient>;
  sharedTemplate: ReturnType<typeof _sharedTemplateClient>;
  templateInteractions: ReturnType<typeof _templateInteractionsClient>;
  userAgents: ReturnType<typeof _userAgentsClient>;
  userAgentsSharing: ReturnType<typeof _userAgentsSharingClient>;
  skillPrompt: ReturnType<typeof _skillPromptClient>;
  agentVisibility: ReturnType<typeof _agentVisibilityClient>;
  chunkInspector: ReturnType<typeof _chunkInspectorClient>;
  skillVisibility: ReturnType<typeof _skillVisibilityClient>;
  instanceAdminOverview: ReturnType<typeof _instanceAdminOverviewClient>;
  lvAdminAssignment: ReturnType<typeof _lvAdminAssignmentClient>;
  landesverbandAdmin: ReturnType<typeof _landesverbandAdminClient>;
  userTextForms: ReturnType<typeof _userTextFormsClient>;
  recurringTasks: ReturnType<typeof _recurringTasksClient>;
  docs: ReturnType<typeof _docsClient>;
  documents: ReturnType<typeof _documentsClient>;
  groups: ReturnType<typeof _groupsClient>;
  userProfile: ReturnType<typeof _userProfileClient>;
  canvas: ReturnType<typeof _canvasClient>;
  canvasAi: ReturnType<typeof _canvasAiClient>;
  monitor: ReturnType<typeof _monitorClient>;
  sites: ReturnType<typeof _sitesClient>;
  texte: ReturnType<typeof _texteClient>;
  subtitler: ReturnType<typeof _subtitlerClient>;
  reisekosten: ReturnType<typeof _reisekostenClient>;
  imagePicker: ReturnType<typeof _imagePickerClient>;
  sharesRead: ReturnType<typeof _sharesReadClient>;
  prompts: ReturnType<typeof _promptsClient>;
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
    recentActivity: _recentActivityClient(),
    content: _contentClient(),
    itemUsage: _itemUsageClient(),
    userUsage: _userUsageClient(),
    transparency: _transparencyClient(),
    globalSearch: _globalSearchClient(),
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
    notebookWordpress: _notebookWordpressClient(),
    userWebsites: _userWebsitesClient(),
    letterheads: _letterheadsClient(),
    notebookSharing: _notebookSharingClient(),
    notifications: _notificationsClient(),
    memory: _memoryClient(),
    email: _emailClient(),
    feedback: _feedbackClient(),
    modelPreferences: _modelPreferencesClient(),
    imageModelPreference: _imageModelPreferenceClient(),
    mcpServers: _mcpServersClient(),
    chatToolApprovals: _chatToolApprovalsClient(),
    imageEdit: _imageEditClient(),
    sharepicText: _sharepicTextClient(),
    adminVorlagen: _adminVorlagenClient(),
    userTemplates: _userTemplatesClient(),
    sharedTemplate: _sharedTemplateClient(),
    templateInteractions: _templateInteractionsClient(),
    userAgents: _userAgentsClient(),
    userAgentsSharing: _userAgentsSharingClient(),
    skillPrompt: _skillPromptClient(),
    agentVisibility: _agentVisibilityClient(),
    chunkInspector: _chunkInspectorClient(),
    skillVisibility: _skillVisibilityClient(),
    instanceAdminOverview: _instanceAdminOverviewClient(),
    lvAdminAssignment: _lvAdminAssignmentClient(),
    landesverbandAdmin: _landesverbandAdminClient(),
    userTextForms: _userTextFormsClient(),
    recurringTasks: _recurringTasksClient(),
    docs: _docsClient(),
    documents: _documentsClient(),
    groups: _groupsClient(),
    userProfile: _userProfileClient(),
    canvas: _canvasClient(),
    canvasAi: _canvasAiClient(),
    monitor: _monitorClient(),
    sites: _sitesClient(),
    texte: _texteClient(),
    subtitler: _subtitlerClient(),
    reisekosten: _reisekostenClient(),
    imagePicker: _imagePickerClient(),
    sharesRead: _sharesReadClient(),
    prompts: _promptsClient(),
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
