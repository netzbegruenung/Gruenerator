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
  searchContract,
  boardsContract,
} from '@gruenerator/contracts';
import { initClient } from '@ts-rest/core';

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

  const response = await axios.request({
    url: path,
    method,
    headers,
    data: body,
    // Let axios resolve with the full response even on 4xx/5xx so ts-rest
    // can match the status to the contract's response map.
    validateStatus: () => true,
    ...(isBinary && { responseType: 'blob' as const }),
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
const _searchClient = () => initClient(searchContract, CLIENT_OPTS);
const _boardsClient = () => initClient(boardsContract, CLIENT_OPTS);

export interface ContractsClient {
  threads: ReturnType<typeof _threadsClient>;
  exports: ReturnType<typeof _exportsClient>;
  recentValues: ReturnType<typeof _recentValuesClient>;
  search: ReturnType<typeof _searchClient>;
  boards: ReturnType<typeof _boardsClient>;
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
    search: _searchClient(),
    boards: _boardsClient(),
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
