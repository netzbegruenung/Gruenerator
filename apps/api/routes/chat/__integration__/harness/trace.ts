import { expect } from 'vitest';

import { runAssertions } from '../../../../evals/assertions.js';
import { parseSseEvents, buildTrace } from '../../../../evals/parseTrace.js';
import {
  type ChatTrace,
  type EvalExpect,
  type ScenarioContext,
  type SseEvent,
} from '../../../../evals/types.js';

import { postStream, postResume } from './testApp.js';

export interface TurnResult {
  res: Response;
  rawBody: string;
  events: SseEvent[];
  trace: ChatTrace;
}

export interface RunTurnOptions {
  /** Opt out of the default `trace.error === null` guard. */
  expectError?: boolean;
  /** Drive `/resume` instead of `/stream`. */
  resume?: boolean;
  /** Extra request headers — `x-decision-log-id` for the live-lane seam. */
  headers?: Record<string, string>;
}

/**
 * One HTTP turn against the mounted router, parsed with the SAME code the live
 * eval lane uses (`evals/parseTrace.ts`) — never a re-implementation.
 *
 * The default `trace.error === null` guard is this harness's most important
 * rail: `buildTrace` already stamps `'stream ended without a done event'` when
 * no terminal event arrives, and the router's outer catch turns ANY unmocked
 * dependency into an SSE `error`. Without this line a silently-broken mock
 * reads as a passing test.
 */
export async function runTurn(
  baseUrl: string,
  body: unknown,
  options: RunTurnOptions = {}
): Promise<TurnResult> {
  const startedAt = performance.now();
  const res = await (options.resume
    ? postResume(baseUrl, body, options.headers)
    : postStream(baseUrl, body, options.headers));
  const rawBody = await res.text();
  const latencyMs = Math.round(performance.now() - startedAt);

  const events = parseSseEvents(rawBody);
  const trace = buildTrace(events, latencyMs);

  if (!options.expectError && trace.error !== null) {
    throw new Error(
      `turn failed: ${trace.error}\n--- raw SSE (first 4000 chars) ---\n${rawBody.slice(0, 4000)}`
    );
  }
  return { res, rawBody, events, trace };
}

/**
 * Stage boundaries are not separately observable; SSE event order is. Asserted
 * on every turn instead of in a dedicated test file that would go stale.
 */
export function assertEventOrder(events: SseEvent[]): void {
  const names = events.map((e) => e.event);
  const at = (name: string): number => names.indexOf(name);

  const intent = at('intent');
  const responseStart = at('response_start');
  const done = at('done');

  if (done === -1) throw new Error(`no 'done' event; got: ${names.join(', ')}`);
  // `done` is terminal for CONTENT, but the router deliberately awaits the
  // persist promise afterwards and may emit a trailing `warning` before
  // `sse.end()` — the client reads until the stream closes, and a persist that
  // failed has no earlier moment to report itself.
  const after = names.slice(done + 1);
  expect(
    after.filter((n) => n !== 'warning'),
    `only 'warning' may follow 'done', got: ${names.join(', ')}`
  ).toEqual([]);

  if (intent !== -1 && responseStart !== -1) {
    expect(intent, `'intent' must precede 'response_start'`).toBeLessThan(responseStart);
  }
  if (responseStart !== -1) {
    expect(responseStart, `'response_start' must precede 'done'`).toBeLessThan(done);
  }

  const threadCreated = at('thread_created');
  const firstDelta = at('text_delta');
  if (threadCreated !== -1 && firstDelta !== -1) {
    expect(threadCreated, `'thread_created' must precede the first 'text_delta'`).toBeLessThan(
      firstDelta
    );
  }
}

/** Runs the live lane's assertion engine and fails the vitest test by name. */
export function expectAssertions(
  trace: ChatTrace,
  evalExpect: EvalExpect,
  ctx?: ScenarioContext
): void {
  const results = runAssertions(trace, evalExpect, ctx);
  const failures = results.filter((r) => !r.pass);
  expect(
    failures.map((f) => `${f.name}: ${f.detail}`),
    'eval assertions'
  ).toEqual([]);
}

/**
 * Any real network call from a turn is a missing mock. Without this, an
 * unmocked Qdrant/Mistral/Nextcloud call either hangs until the vitest timeout
 * or — worse — quietly succeeds and makes the suite depend on the network.
 */
export function installNetworkGuard(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(url, 'http://127.0.0.1').hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`network guard: unmocked outbound request to ${url}`);
    }
    return original(input as RequestInfo, init);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}
