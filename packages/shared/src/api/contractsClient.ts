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
  initClient,
  isZodType,
  type AppRoute,
  type AppRouter,
  type InitClientArgs,
} from '@ts-rest/core';
import { isAxiosError } from 'axios';

import { getGlobalApiClient } from './client.js';

import type * as ContractsModule from '@gruenerator/contracts';

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
 * For endpoints that do real work server-side: model calls, crawls, imports.
 * Deliberately just *above* nginx's 300s cut, so the server's own 504 wins the
 * race and the user gets "Der Server reagiert nicht" instead of a client-side
 * abort carrying no status. Anything slower than this was already unreachable
 * through nginx, so this is not a restriction — it is the real ceiling, named.
 */
export const SERVER_TASK_TIMEOUT_MS = 310_000;

/** A contract route that declares `metadata: { serverTask: true }` gets {@link SERVER_TASK_TIMEOUT_MS}. */
function isServerTask(route: AppRoute): boolean {
  const metadata = route.metadata as { serverTask?: unknown } | undefined;
  return metadata?.serverTask === true;
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
      ...(isServerTask(route) && { timeout: SERVER_TASK_TIMEOUT_MS }),
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

// ── Lazy per-namespace clients ───────────────────────────────────────────────
//
// `@gruenerator/contracts` (every contract plus its Zod schemas) is large, and
// almost every namespace is only used by a lazy route. A static import here
// put all of it into the web entry's closure, and the first
// `getContractsClient()` ran ~96 `initClient` factories on top. So the contract
// *values* are now loaded with a dynamic `import()` on the first route call of
// a namespace. That costs nothing at the call sites: every ts-rest route call
// already returns a Promise, so `client.ns.route(args)` just resolves a tick
// later the first time. The type of `ContractsClient` is derived from the
// contract TYPES below (type-only, erased at build time) and is unchanged.
//
// The contract values come from `./contractsRegistry.ts`, one lazy chunk for
// all namespaces (contracts that boot-path modules import by name stay in the
// entry anyway). It is out of the boot closure.

type ContractModule = typeof ContractsModule;

type PlainClient<T extends AppRouter> = ReturnType<typeof initClient<T, typeof CLIENT_OPTS>>;
type ValidatedClient<T extends AppRouter> = ReturnType<
  typeof initClient<T, typeof VALIDATED_CLIENT_OPTS>
>;

/**
 * namespace → contract export + client options. `validated` namespaces parse
 * the 200 body against the contract's Zod schema — see VALIDATED_CLIENT_OPTS
 * (`canvas`, `subtitler`, `sharesRead`).
 */
const NAMESPACES = {
  threads: { contract: 'threadsContract', opts: 'plain' },
  exports: { contract: 'exportsContract', opts: 'plain' },
  speech: { contract: 'speechContract', opts: 'plain' },
  recentValues: { contract: 'recentValuesContract', opts: 'plain' },
  recentActivity: { contract: 'recentActivityContract', opts: 'plain' },
  content: { contract: 'contentContract', opts: 'plain' },
  trash: { contract: 'trashContract', opts: 'plain' },
  itemUsage: { contract: 'itemUsageContract', opts: 'plain' },
  userLibrary: { contract: 'userLibraryContract', opts: 'plain' },
  userUsage: { contract: 'userUsageContract', opts: 'plain' },
  trees: { contract: 'treesContract', opts: 'plain' },
  transparency: { contract: 'transparencyContract', opts: 'plain' },
  globalSearch: { contract: 'globalSearchContract', opts: 'plain' },
  research: { contract: 'researchContract', opts: 'plain' },
  boards: { contract: 'boardsContract', opts: 'plain' },
  sheets: { contract: 'sheetsContract', opts: 'plain' },
  presentations: { contract: 'presentationsContract', opts: 'plain' },
  boardComments: { contract: 'boardCommentsContract', opts: 'plain' },
  entityReactions: { contract: 'entityReactionsContract', opts: 'plain' },
  entityComments: { contract: 'entityCommentsContract', opts: 'plain' },
  boardAgent: { contract: 'boardAgentContract', opts: 'plain' },
  boardActivity: { contract: 'boardActivityContract', opts: 'plain' },
  boardSubscriptions: { contract: 'boardSubscriptionsContract', opts: 'plain' },
  boardSchedules: { contract: 'boardSchedulesContract', opts: 'plain' },
  boardAttachments: { contract: 'boardAttachmentsContract', opts: 'plain' },
  boardCardDocuments: { contract: 'boardCardDocumentsContract', opts: 'plain' },
  publicBoards: { contract: 'publicBoardsContract', opts: 'plain' },
  notebook: { contract: 'notebookContract', opts: 'plain' },
  notebookCollections: { contract: 'notebookCollectionsContract', opts: 'plain' },
  wolkePending: { contract: 'wolkePendingContract', opts: 'plain' },
  notebookWordpress: { contract: 'notebookWordpressContract', opts: 'plain' },
  userWebsites: { contract: 'userWebsitesContract', opts: 'plain' },
  antragsgruenSites: { contract: 'antragsgruenSitesContract', opts: 'plain' },
  nuudelPolls: { contract: 'nuudelPollsContract', opts: 'plain' },
  letterheads: { contract: 'letterheadsContract', opts: 'plain' },
  notebookSharing: { contract: 'notebookSharingContract', opts: 'plain' },
  chatThreadSharing: { contract: 'chatThreadSharingContract', opts: 'plain' },
  notifications: { contract: 'notificationsContract', opts: 'plain' },
  memory: { contract: 'memoryContract', opts: 'plain' },
  email: { contract: 'emailContract', opts: 'plain' },
  feedback: { contract: 'feedbackContract', opts: 'plain' },
  newsletter: { contract: 'newsletterContract', opts: 'plain' },
  contentReports: { contract: 'contentReportContract', opts: 'plain' },
  adminReports: { contract: 'adminReportsContract', opts: 'plain' },
  adminContentSync: { contract: 'adminContentSyncContract', opts: 'plain' },
  translation: { contract: 'translationContract', opts: 'plain' },
  modelPreferences: { contract: 'modelPreferencesContract', opts: 'plain' },
  imageModelPreference: { contract: 'imageModelPreferenceContract', opts: 'plain' },
  mcpServers: { contract: 'mcpServersContract', opts: 'plain' },
  chatToolApprovals: { contract: 'chatToolApprovalsContract', opts: 'plain' },
  imageEdit: { contract: 'imageEditContract', opts: 'plain' },
  sharepicCreator: { contract: 'sharepicCreatorContract', opts: 'plain' },
  sharepicVorlagen: { contract: 'sharepicVorlagenContract', opts: 'plain' },
  sharepicText: { contract: 'sharepicTextContract', opts: 'plain' },
  adminVorlagen: { contract: 'adminVorlagenContract', opts: 'plain' },
  userTemplates: { contract: 'userTemplatesContract', opts: 'plain' },
  sharedTemplate: { contract: 'sharedTemplateContract', opts: 'plain' },
  templateInteractions: { contract: 'templateInteractionsContract', opts: 'plain' },
  studioAssets: { contract: 'studioAssetsContract', opts: 'plain' },
  marketplace: { contract: 'marketplaceContract', opts: 'plain' },
  parteitage: { contract: 'parteitageContract', opts: 'plain' },
  parteitageAdmin: { contract: 'parteitageAdminContract', opts: 'plain' },
  userAgents: { contract: 'userAgentsContract', opts: 'plain' },
  userAgentsSharing: { contract: 'userAgentsSharingContract', opts: 'plain' },
  skillPrompt: { contract: 'skillPromptContract', opts: 'plain' },
  agentVisibility: { contract: 'agentVisibilityContract', opts: 'plain' },
  chunkInspector: { contract: 'chunkInspectorContract', opts: 'plain' },
  tableRepair: { contract: 'tableRepairContract', opts: 'plain' },
  bundestagQa: { contract: 'bundestagQaContract', opts: 'plain' },
  connectorTest: { contract: 'connectorTestContract', opts: 'plain' },
  connections: { contract: 'connectionsContract', opts: 'plain' },
  skillVisibility: { contract: 'skillVisibilityContract', opts: 'plain' },
  instanceAdminOverview: { contract: 'instanceAdminOverviewContract', opts: 'plain' },
  adminStats: { contract: 'adminStatsContract', opts: 'plain' },
  appRelease: { contract: 'appReleaseContract', opts: 'plain' },
  lvAdminAssignment: { contract: 'lvAdminAssignmentContract', opts: 'plain' },
  landesverbandAdmin: { contract: 'landesverbandAdminContract', opts: 'plain' },
  userTextForms: { contract: 'userTextFormsContract', opts: 'plain' },
  recurringTasks: { contract: 'recurringTasksContract', opts: 'plain' },
  docs: { contract: 'docsContract', opts: 'plain' },
  docSnapshots: { contract: 'docSnapshotsContract', opts: 'plain' },
  documents: { contract: 'documentsContract', opts: 'plain' },
  groups: { contract: 'groupsContract', opts: 'plain' },
  userProfile: { contract: 'userProfileContract', opts: 'plain' },
  canvas: { contract: 'canvasContract', opts: 'validated' },
  videoProjects: { contract: 'videoProjectsContract', opts: 'validated' },
  monitor: { contract: 'monitorContract', opts: 'plain' },
  sites: { contract: 'sitesContract', opts: 'plain' },
  texte: { contract: 'texteContract', opts: 'plain' },
  subtitler: { contract: 'subtitlerContract', opts: 'validated' },
  reisekosten: { contract: 'reisekostenContract', opts: 'plain' },
  imagePicker: { contract: 'imagePickerContract', opts: 'plain' },
  sharesRead: { contract: 'sharesReadContract', opts: 'validated' },
  prompts: { contract: 'promptsContract', opts: 'plain' },
  explainables: { contract: 'explainablesContract', opts: 'plain' },
  publicExplainables: { contract: 'publicExplainablesContract', opts: 'plain' },
  podcasts: { contract: 'podcastsContract', opts: 'plain' },
  videoAi: { contract: 'videoAiContract', opts: 'plain' },
  mediaImport: { contract: 'mediaImportContract', opts: 'plain' },
  briefing: { contract: 'briefingContract', opts: 'plain' },
} as const satisfies Record<
  string,
  { contract: keyof ContractModule; opts: 'plain' | 'validated' }
>;

type Namespaces = typeof NAMESPACES;
type NamespaceName = keyof Namespaces;

export type ContractsClient = {
  [N in NamespaceName]: ContractModule[Namespaces[N]['contract']] extends infer T extends AppRouter
    ? Namespaces[N]['opts'] extends 'validated'
      ? ValidatedClient<T>
      : PlainClient<T>
    : never;
};

type NamespaceClient = Record<string, unknown>;

type ContractRegistry = Pick<ContractModule, Namespaces[NamespaceName]['contract']>;

let contractsModule: Promise<ContractRegistry> | null = null;
const namespaceClients = new Map<NamespaceName, Promise<NamespaceClient>>();

function loadContracts(): Promise<ContractRegistry> {
  if (!contractsModule) {
    // Not `import('@gruenerator/contracts')`: see contractsRegistry.ts.
    const pending: Promise<ContractRegistry> = import('./contractsRegistry.js').then(
      (m) => m.CONTRACTS
    );
    contractsModule = pending;
    // A failed chunk load (offline, stale deploy) must not be cached forever.
    pending.catch(() => {
      if (contractsModule === pending) contractsModule = null;
    });
  }
  return contractsModule;
}

function loadNamespace(name: NamespaceName): Promise<NamespaceClient> {
  const cached = namespaceClients.get(name);
  if (cached) return cached;

  const spec = NAMESPACES[name];
  const pending = loadContracts().then((contracts) => {
    // Boundary cast: the table pins `spec.contract` to a contract export, which
    // `ContractsClient` already types precisely. Here it is only handed on.
    const contract = contracts[spec.contract] as AppRouter;
    const opts: InitClientArgs = spec.opts === 'validated' ? VALIDATED_CLIENT_OPTS : CLIENT_OPTS;
    return initClient(contract, opts) as NamespaceClient;
  });
  namespaceClients.set(name, pending);
  pending.catch(() => {
    if (namespaceClients.get(name) === pending) namespaceClients.delete(name);
  });
  return pending;
}

/**
 * A callable stand-in for `client[namespace](.sub)*.route`. Property access
 * extends the path; calling it loads the namespace, walks the path on the real
 * client and invokes the real route function. `then` and symbols answer
 * `undefined` so a proxy is never mistaken for a thenable (`await client.ns`,
 * `return client.ns` from an async function) or an iterable.
 */
function createRouteProxy(name: NamespaceName, path: readonly string[]): unknown {
  const children = new Map<string, unknown>();
  return new Proxy(function lazyRoute() {}, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      let child = children.get(prop);
      if (child === undefined) {
        child = createRouteProxy(name, [...path, prop]);
        children.set(prop, child);
      }
      return child;
    },
    apply(_target, _thisArg, args: unknown[]) {
      return loadNamespace(name).then((client) => {
        let target: unknown = client;
        for (const key of path) target = (target as Record<string, unknown>)[key];
        if (typeof target !== 'function') {
          throw new TypeError(`contracts client: ${[name, ...path].join('.')} is not a route`);
        }
        return (target as (...a: unknown[]) => unknown)(...args);
      });
    },
  });
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

  const entries = (Object.keys(NAMESPACES) as NamespaceName[]).map(
    (name) => [name, createRouteProxy(name, [])] as const
  );
  // Boundary cast: the proxies are untyped by construction; `ContractsClient`
  // is the contract-derived type they stand in for.
  _client = Object.fromEntries(entries) as unknown as ContractsClient;
  return _client;
}

/**
 * Reset the client singleton — useful in tests or when the axios instance
 * is replaced (e.g. in Storybook / test harnesses).
 */
export function resetContractsClient(): void {
  _client = null;
  namespaceClients.clear();
}
