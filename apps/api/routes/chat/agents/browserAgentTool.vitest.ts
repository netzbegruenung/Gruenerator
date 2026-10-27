/**
 * `website_erkunden` against a mocked browser service, URL check, asset store
 * and rate limiter. What matters: nothing reaches the service before the URL
 * and the hourly budget are checked, every step leaves as an asset URL (never
 * base64), and a user abort ends the run as an abort, not as a tool error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeWebsiteErkundenTool } from './browserAgentTool.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { BrowserAgentEvent } from '../../../services/browserAgent/browserAgentClient.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const runBrowserAgent = vi.fn();
const validateUrlForFetch = vi.fn();
const storeBinaryAsset = vi.fn();
const incrementCount = vi.fn();

vi.mock('../../../services/browserAgent/browserAgentClient.js', () => ({
  runBrowserAgent: (...args: unknown[]) => runBrowserAgent(...args) as unknown,
  BrowserAgentBusyError: class BrowserAgentBusyError extends Error {},
}));
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (...args: unknown[]) => validateUrlForFetch(...args) as unknown,
}));
vi.mock('../services/computeAssetStorage.js', () => ({
  storeBinaryAsset: (...args: unknown[]) => storeBinaryAsset(...args) as unknown,
}));
vi.mock('../../../middleware/rateLimitMiddleware.js', () => ({
  rateLimiter: { incrementCount: (...args: unknown[]) => incrementCount(...args) as unknown },
}));

const B64 = Buffer.from('bytes').toString('base64');

const step = (n: number): BrowserAgentEvent => ({
  type: 'step',
  n,
  url: `https://example.org/${n}`,
  title: `Seite ${n}`,
  action: 'click',
  target: 'Suche',
  x_pct: 0.5,
  y_pct: 0.25,
  thought: 'Ich klicke auf Suche',
  screenshot_jpeg_b64: B64,
});
const saved = (name: string): BrowserAgentEvent => ({
  type: 'screenshot_saved',
  file_name: name,
  png_b64: B64,
});
const done = (over: Partial<Extract<BrowserAgentEvent, { type: 'done' }>> = {}) =>
  ({
    type: 'done',
    summary: 'Gefunden.',
    agent_says_success: true,
    saved: [],
    steps: 2,
    seconds: 12,
    timed_out: false,
    ...over,
  }) as BrowserAgentEvent;

function streamOf(events: BrowserAgentEvent[]) {
  return async function* () {
    for (const e of events) {
      await Promise.resolve();
      yield e;
    }
  };
}

function makeCtx() {
  const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const state = {} as ChatGraphState;
  const sse = {
    send: (event: string, payload: Record<string, unknown>) => sent.push({ event, payload }),
  } as unknown as SSEWriter;
  return { ctx: { state, sse, userId: 'user-1' }, sent, state };
}

const run = (tool: unknown, input: unknown, abortSignal?: AbortSignal) =>
  (tool as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    { toolCallId: 'c1', messages: [], ...(abortSignal && { abortSignal }) }
  );

const INPUT = { url: 'https://example.org', auftrag: 'Finde die Suche' };

beforeEach(() => {
  vi.clearAllMocks();
  validateUrlForFetch.mockResolvedValue({ isValid: true, url: new URL('https://example.org/') });
  incrementCount.mockResolvedValue({ success: true, canGenerate: true });
  let i = 0;
  storeBinaryAsset.mockImplementation((_u: string, _b: Buffer, ext: string) => {
    i += 1;
    return Promise.resolve({ fileName: `f${i}.${ext}`, url: `/api/asset/f${i}.${ext}` });
  });
});

describe('website_erkunden', () => {
  it('rejects private start url before calling the service', async () => {
    validateUrlForFetch.mockResolvedValue({ isValid: false, error: 'private' });
    const { ctx } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), {
      url: 'http://10.0.0.1',
      auftrag: 'x',
    });
    expect(result.error).toEqual(expect.any(String));
    expect(runBrowserAgent).not.toHaveBeenCalled();
    expect(incrementCount).not.toHaveBeenCalled();
  });

  it('emits start, one update per step with stored image url, and done', async () => {
    runBrowserAgent.mockImplementation(streamOf([step(1), step(2), done()]));
    const { ctx, sent, state } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), INPUT);

    expect(sent[0]?.event).toBe('browser_session_start');
    const id = sent[0]?.payload.id;
    expect(sent[0]?.payload.url).toBe('https://example.org/');

    const stepUpdates = sent.filter((s) => s.event === 'browser_session_update' && s.payload.step);
    expect(stepUpdates).toHaveLength(2);
    expect(stepUpdates[0]?.payload).toMatchObject({
      id,
      step: {
        n: 1,
        url: 'https://example.org/1',
        action: 'click',
        target: 'Suche',
        xPct: 0.5,
        yPct: 0.25,
        imageUrl: '/api/asset/f1.jpg',
      },
    });

    const last = sent[sent.length - 1];
    expect(last?.payload).toMatchObject({ id, status: 'done', summary: 'Gefunden.' });
    expect(result).toMatchObject({ summary: 'Gefunden.', schritte: 2, abgebrochen: false });
    expect(state.browserSession).toMatchObject({
      id,
      status: 'done',
      startUrl: 'https://example.org/',
    });
    expect(state.browserSession?.steps).toHaveLength(2);
  });

  it('reports fehlend when fewer screenshots than screenshots_erwartet', async () => {
    runBrowserAgent.mockImplementation(
      streamOf([step(1), saved('a-(1).png'), done({ saved: ['a-(1).png'] })])
    );
    const { ctx, sent } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), { ...INPUT, screenshots_erwartet: 3 });
    expect(result.fehlend).toBe(2);
    expect(result.screenshots).toEqual([{ name: 'a-(1).png', url: '/api/asset/f2.png' }]);
    expect(
      sent.some(
        (s) => (s.payload.screenshot as { name?: string } | undefined)?.name === 'a-(1).png'
      )
    ).toBe(true);
  });

  it('marks a timed-out run as Teilergebnis', async () => {
    runBrowserAgent.mockImplementation(
      streamOf([step(1), done({ timed_out: true, summary: 'Halb.' })])
    );
    const { ctx } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), INPUT);
    expect(String(result.summary)).toMatch(/Teilergebnis/);
  });

  it('aborts the service run when the loop signal aborts', async () => {
    const controller = new AbortController();
    runBrowserAgent.mockImplementation(async function* (input: { signal: AbortSignal }) {
      yield step(1);
      controller.abort();
      await Promise.resolve();
      expect(input.signal.aborted).toBe(true);
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const { ctx, sent, state } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), INPUT, controller.signal);
    expect(result.abgebrochen).toBe(true);
    expect(result.error).toBeUndefined();
    expect(state.browserSession?.status).toBe('failed');
    expect(sent[sent.length - 1]?.payload.status).toBe('failed');
  });

  it('refuses with a German message when the rate limit is exhausted', async () => {
    incrementCount.mockResolvedValue({ success: false, limitReached: true, canGenerate: false });
    const { ctx, sent } = makeCtx();
    const result = await run(makeWebsiteErkundenTool(ctx), INPUT);
    expect(String(result.error)).toMatch(/Stunde/);
    expect(runBrowserAgent).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('stores no base64 in metadata', async () => {
    runBrowserAgent.mockImplementation(
      streamOf([step(1), saved('a.png'), done({ saved: ['a.png'] })])
    );
    const { ctx, sent, state } = makeCtx();
    await run(makeWebsiteErkundenTool(ctx), INPUT);
    const meta = JSON.stringify(state.browserSession);
    expect(meta).not.toMatch(/base64|b64/);
    expect(meta).not.toContain(B64);
    expect(JSON.stringify(sent)).not.toContain(B64);
  });
});
