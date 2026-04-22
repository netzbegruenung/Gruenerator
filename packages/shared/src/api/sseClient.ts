/**
 * Typed SSE client for contract endpoints declared with
 * `responses: { 200: z.unknown() }`.
 *
 * ts-rest can't model Server-Sent Events natively, so streaming contracts
 * declare the 200 response as `z.unknown()` and consumers use this helper
 * to get a typed `AsyncIterable<Event>` back. Each `data:` frame from the
 * stream is parsed against a Zod discriminated union and yielded to the
 * caller; malformed frames are logged and skipped so one bad event can't
 * kill an otherwise-working stream.
 *
 * ## Usage pattern (matches Session N+5 design template)
 *
 * ```ts
 * import { streamSSE } from '@gruenerator/shared/api';
 * import { searchStreamEventSchema } from '@gruenerator/contracts';
 *
 * for await (const event of streamSSE('/search/stream', searchStreamEventSchema, {
 *   method: 'POST',
 *   body: { query: 'klimaschutz', includeSummary: true },
 * })) {
 *   switch (event.event) {
 *     case 'progress': setProgress(event.stage, event.message); break;
 *     case 'text_delta': appendText(event.text); break;
 *     case 'done': setResult(event.content, event.metadata); break;
 *     case 'error': setError(event.error); break;
 *   }
 * }
 * ```
 *
 * ## Why not just use `EventSource`?
 *
 * Browser `EventSource` only supports GET requests and auto-reconnects
 * aggressively. We need:
 *   - POST with a JSON body (the request IS the query)
 *   - Auth headers from the existing axios client (cookies / Bearer token)
 *   - No auto-reconnect (the backend sends one terminal `done`/`error`
 *     and closes; reconnect would re-issue the search)
 *
 * `fetch()` + a manual `TextDecoder` reader loop handles all three.
 *
 * ## baseURL and path-prefix handling
 *
 * Mirrors `axiosFetcher` in `contractsClient.ts`: strips leading `/api`
 * from the contract path because the axios client's `baseURL` already
 * includes it on production. The `fetch()` call below assembles the
 * final URL the same way axios would.
 */

import { type z } from 'zod';

import { getGlobalApiClient } from './client.js';

export interface StreamSSEOptions<TBody = unknown> {
  /** HTTP method. Streaming contracts are typically POST. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request body (will be JSON-stringified). Omit for GET. */
  body?: TBody;
  /** Extra headers to merge onto the default `Content-Type: application/json`. */
  headers?: Record<string, string>;
  /**
   * AbortSignal to cancel the stream mid-flight. Calling `.abort()` on
   * the controller will close the reader loop and throw from the
   * `AsyncIterable` consumer.
   */
  signal?: AbortSignal;
}

/**
 * Strip the leading `/api` so the path is relative to the axios client's
 * `baseURL`. Same reconciliation pattern as `axiosFetcher` in
 * `contractsClient.ts` — the contracts are canonical and always use
 * `/api/...` absolute paths; this helper reconciles with the runtime
 * baseURL convention.
 */
function stripApiPrefix(path: string): string {
  return path.startsWith('/api/') ? path.slice(4) : path;
}

/**
 * Resolve the absolute fetch URL by joining the axios client's baseURL
 * with the (prefix-stripped) path. Works in dev (baseURL `''`, Vite
 * proxy rewrites `/api/*`) AND prod (baseURL `/api`, nginx proxies).
 */
function resolveUrl(path: string): string {
  const axios = getGlobalApiClient();
  const baseURL = typeof axios.defaults.baseURL === 'string' ? axios.defaults.baseURL : '';
  const relative = stripApiPrefix(path);
  // Normalise trailing/leading slashes
  const cleanBase = baseURL.replace(/\/$/, '');
  const cleanPath = relative.startsWith('/') ? relative : `/${relative}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Consume a Server-Sent Events stream from a ts-rest contract endpoint
 * and yield validated events. Each `data:` frame is JSON-parsed and
 * validated against the provided Zod schema. Invalid frames are logged
 * and skipped.
 *
 * The stream ends when the server closes the connection OR when the
 * signal aborts. Errors from the network or the reader propagate as
 * thrown exceptions from the `AsyncIterable` consumer.
 *
 * @param path     Contract path (e.g. `/api/search/stream`). Canonical.
 * @param schema   Zod discriminated union for the event payload.
 * @param options  Request method, body, headers, and abort signal.
 * @returns `AsyncIterable<z.infer<typeof schema>>` — consume with `for await`.
 */
export async function* streamSSE<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options: StreamSSEOptions = {}
): AsyncIterable<z.infer<TSchema>> {
  const { method = 'POST', body, headers = {}, signal } = options;

  const url = resolveUrl(path);
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    ...(signal && { signal }),
  });

  if (!response.ok) {
    throw new Error(`SSE request failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('SSE response has no body stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines (\n\n or \r\n\r\n). Split
      // on that boundary; everything before the last boundary is a
      // complete frame, everything after is the still-accumulating tail.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const event = parseFrame(frame, schema);
        if (event !== undefined) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse one SSE frame (a block of `field: value\n` lines) and extract
 * the `data:` field. JSON.parse it, then validate with the Zod schema.
 * Returns `undefined` if the frame is malformed, not a data event, or
 * fails validation — the caller skips it silently.
 *
 * Note: SSE frames can have multi-line `data:` fields (one `data:`
 * prefix per line, concatenated by the reader). We handle that.
 */
function parseFrame<TSchema extends z.ZodTypeAny>(
  frame: string,
  schema: TSchema
): z.infer<TSchema> | undefined {
  const lines = frame.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;

  // Concatenate all `data:` lines into one JSON payload.
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return undefined;

  const rawJson = dataLines.join('\n');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    console.warn('[streamSSE] Failed to JSON-parse frame:', rawJson, err);
    return undefined;
  }

  // The backend's `sse.sendRaw(eventName, payload)` helper emits frames
  // with an `event:` field and a `data:` payload that doesn't include
  // the event name inline. We need to reconstruct the discriminator by
  // peeking at the frame's `event:` line and injecting it into the
  // parsed payload before Zod-validating. This keeps the contract
  // schema's `z.discriminatedUnion('event', ...)` shape intact.
  const eventLine = lines.find((line) => line.startsWith('event:'));
  const eventName = eventLine?.slice(6).trim();

  const withDiscriminator =
    eventName && typeof parsed === 'object' && parsed !== null && !('event' in parsed)
      ? { ...(parsed as Record<string, unknown>), event: eventName }
      : parsed;

  const result = schema.safeParse(withDiscriminator);
  if (!result.success) {
    console.warn('[streamSSE] Frame failed schema validation:', result.error.issues);
    return undefined;
  }
  return result.data as z.infer<TSchema>;
}
