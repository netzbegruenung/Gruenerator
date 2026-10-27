import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  BROWSER_AGENT_SECRET: 'test-secret' as string | null,
  BROWSER_AGENT_TOKEN_SECRET: 'test-token-secret' as string | null,
  BROWSER_AGENT_URL: 'http://agent:8000' as string | null,
  API_INTERNAL_BASE_URL: 'http://api:3001' as string | null,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const { runBrowserAgent, BrowserAgentBusyError } = await import('./browserAgentClient.js');
const { verifyRunToken } = await import('./runToken.js');

const enc = new TextEncoder();

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

const input = (signal: AbortSignal) => ({
  runId: 'run-1',
  userId: 'user-1',
  task: 'look',
  startUrl: 'https://example.org',
  signal,
});

async function collect(it: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const e of it) out.push(e);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('runBrowserAgent', () => {
  it('parses NDJSON across chunk boundaries and skips invalid lines', async () => {
    const step =
      '{"type":"step","n":1,"url":"u","title":"t","action":"click","target":null,"x_pct":null,"y_pct":null,"thought":null,"screenshot_jpeg_b64":""}\n';
    const done =
      '{"type":"done","summary":"ok","agent_says_success":null,"saved":["a-(1).png"],"steps":1,"seconds":1.5,"timed_out":true}\n';
    const fetchMock = vi.fn(
      async () =>
        new Response(streamOf([step.slice(0, 40), step.slice(40), 'not json\n', done]), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = (await collect(runBrowserAgent(input(new AbortController().signal)))) as Array<{
      type: string;
    }>;
    expect(events.map((e) => e.type)).toEqual(['step', 'done']);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://agent:8000/runs');
    expect((init.headers as Record<string, string>)['X-Browser-Agent-Secret']).toBe('test-secret');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      run_id: 'run-1',
      task: 'look',
      start_url: 'https://example.org',
      llm_base_url: 'http://api:3001/api/browser-agent/llm/v1',
    });
    expect(verifyRunToken(body.llm_token)).toEqual({ runId: 'run-1', userId: 'user-1' });
  });

  it('aborts the fetch when the signal aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')));
          })
      )
    );
    const ac = new AbortController();
    const p = collect(runBrowserAgent(input(ac.signal)));
    ac.abort();
    await expect(p).rejects.toThrow();
  });

  it('throws BrowserAgentBusyError on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('busy', { status: 429 }))
    );
    await expect(
      collect(runBrowserAgent(input(new AbortController().signal)))
    ).rejects.toBeInstanceOf(BrowserAgentBusyError);
  });

  it('throws a plain error with status on other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 }))
    );
    await expect(collect(runBrowserAgent(input(new AbortController().signal)))).rejects.toThrow(
      /500/
    );
  });
});
