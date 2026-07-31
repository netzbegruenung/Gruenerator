/**
 * This endpoint hands an authenticated caller direct access to a paid LLM
 * upstream, so the tests that carry weight are the ones about what it refuses:
 * a request without a key, a key without the scope, a model outside the
 * allowlist, and a prompt long enough that the upstream would truncate it
 * silently and answer over the fragment with HTTP 200.
 *
 * The auth middleware runs for real (only its DB hop is faked), because
 * "requireApiKey is mounted" is exactly the property a mocked middleware would
 * stop testing.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  LITELLM_BASE_URL: 'https://litellm.test' as string | undefined,
  LITELLM_API_KEY: 'upstream-secret' as string | undefined,
  NODE_ENV: 'test',
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

/** The row `requireApiKey` finds for the presented key; null = no such key. */
let apiKeyRow: Record<string, unknown> | null = null;

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(apiKeyRow ? [apiKeyRow] : []) }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));

vi.mock('../../utils/redis/index.js', () => ({
  redisClient: { incr: () => Promise.resolve(1), expire: () => Promise.resolve(1) },
}));

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
/** Our own requests to the test server go out over the real fetch. */
const realFetch = globalThis.fetch;
vi.stubGlobal('fetch', (input: unknown, init?: unknown) =>
  fetchMock(String(input), init as RequestInit)
);

const { default: chatCompletionsRouter } = await import('./chatCompletionsRouter.js');
const { MAX_PROMPT_TOKENS } = await import('../../services/ai/litellmPassthrough.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/v1/chat/completions', chatCompletionsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

function keyRow(permissions: string[]): Record<string, unknown> {
  return {
    id: 'key-1',
    user_id: 'user-1',
    scopes: { permissions },
    rate_limit_per_minute: null,
    revoked_at: null,
    expires_at: null,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return realFetch(`${baseUrl}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** POST with a key that carries the required scope. */
function authedPost(body: unknown): Promise<Response> {
  return post(body, { Authorization: 'Bearer plaintext-key' });
}

/** The JSON body the router actually handed to the upstream. */
function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as Record<string, unknown>;
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const MESSAGES = [{ role: 'user', content: 'Summiere Spalte B.' }];

function completionResponse(content = 'Fertig.'): Response {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

/** An SSE response whose body arrives in several chunks, as the upstream sends it. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  apiKeyRow = keyRow(['chat:completions']);
  envMock.LITELLM_BASE_URL = 'https://litellm.test';
  envMock.LITELLM_API_KEY = 'upstream-secret';
});

describe('POST /api/v1/chat/completions', () => {
  describe('auth', () => {
    it('refuses a request with no Authorization header', async () => {
      const res = await post({ messages: MESSAGES });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a key that does not exist', async () => {
      apiKeyRow = null;
      const res = await authedPost({ messages: MESSAGES });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a revoked key', async () => {
      apiKeyRow = { ...keyRow(['chat:completions']), revoked_at: new Date() };
      const res = await authedPost({ messages: MESSAGES });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a valid key that lacks the chat:completions scope', async () => {
      // A notebook partner key must not double as LLM credit.
      apiKeyRow = keyRow(['notebooks:read']);
      const res = await authedPost({ messages: MESSAGES });
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a wildcard scope', async () => {
      apiKeyRow = keyRow(['*']);
      fetchMock.mockResolvedValueOnce(completionResponse());
      const res = await authedPost({ messages: MESSAGES });
      expect(res.status).toBe(200);
    });
  });

  describe('model allowlist', () => {
    it('refuses verdigado-pro, which failed the tool-loop probe', async () => {
      const res = await authedPost({ model: 'verdigado-pro', messages: MESSAGES });
      expect(res.status).toBe(400);
      expect(await jsonOf(res)).toMatchObject({ allowedModels: ['verdigado-think'] });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an arbitrary model, so a key is not general LiteLLM access', async () => {
      const res = await authedPost({ model: 'gpt-4o', messages: MESSAGES });
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('defaults to verdigado-think when the client sends no model', async () => {
      fetchMock.mockResolvedValueOnce(completionResponse());
      await authedPost({ messages: MESSAGES });

      expect(sentBody().model).toBe('verdigado-think');
    });
  });

  describe('context window', () => {
    it('takes its ceiling from the chat stack, not a local guess', async () => {
      // getContextWindow falls back to 32768 for an unknown provider, which
      // would make every test below pass for the wrong reason. This pins the
      // value to CTX_VERDIGADO and fails if either side moves alone.
      expect(MAX_PROMPT_TOKENS).toBe(64_000);
    });

    it('refuses a prompt the upstream would silently truncate', async () => {
      // The failure mode this guards is invisible: Ollama answers HTTP 200 over
      // the fragment. Only a 400 gives the caller something to act on.
      const huge = 'x'.repeat(MAX_PROMPT_TOKENS * 4 + 10_000);
      const res = await authedPost({ messages: [{ role: 'user', content: huge }] });

      expect(res.status).toBe(400);
      expect(await jsonOf(res)).toMatchObject({ maxTokens: MAX_PROMPT_TOKENS });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('counts tool definitions, not just messages', async () => {
      // The add-in ships 20 Excel tool schemas on every turn; leaving them out
      // of the estimate would let a request past that the upstream truncates.
      const tools = [
        { type: 'function', function: { name: 'setRange', description: 'y'.repeat(400_000) } },
      ];
      const res = await authedPost({ messages: MESSAGES, tools });

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lets a normal-sized request through', async () => {
      fetchMock.mockResolvedValueOnce(completionResponse());
      const res = await authedPost({ messages: MESSAGES });
      expect(res.status).toBe(200);
    });
  });

  describe('passthrough', () => {
    it('forwards unknown OpenAI parameters verbatim', async () => {
      fetchMock.mockResolvedValueOnce(completionResponse());
      await authedPost({
        messages: MESSAGES,
        temperature: 0.2,
        tool_choice: 'auto',
        response_format: { type: 'json_object' },
      });

      const sent = sentBody();
      expect(sent.temperature).toBe(0.2);
      expect(sent.tool_choice).toBe('auto');
      expect(sent.response_format).toEqual({ type: 'json_object' });
    });

    it('strips client-supplied upstream routing overrides', async () => {
      // LiteLLM honours these as per-request overrides; accepting them would
      // turn our authenticated proxy into an open relay to any endpoint.
      fetchMock.mockResolvedValueOnce(completionResponse());
      await authedPost({
        messages: MESSAGES,
        api_base: 'https://evil.example/v1',
        api_key: 'attacker-key',
      });

      const sent = sentBody();
      expect(sent).not.toHaveProperty('api_base');
      expect(sent).not.toHaveProperty('api_key');
    });

    it('authenticates upstream with the server key, never the caller key', async () => {
      fetchMock.mockResolvedValueOnce(completionResponse());
      await authedPost({ messages: MESSAGES });

      const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer upstream-secret');
      expect(headers.Authorization).not.toContain('plaintext-key');
    });

    it('returns the upstream completion body unchanged', async () => {
      fetchMock.mockResolvedValueOnce(completionResponse('42'));
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(200);
      expect(await jsonOf(res)).toMatchObject({
        choices: [{ message: { content: '42' } }],
      });
    });

    it('rejects a body with no messages', async () => {
      const res = await authedPost({ model: 'verdigado-think' });
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('streaming', () => {
    it('pipes SSE bytes through, including the reasoning field the AI SDK drops', async () => {
      // The whole reason this is a byte pipe and not the AI SDK: `delta.reasoning`
      // is absent from @ai-sdk/openai's chat-completions schema, so routing the
      // stream through it would discard verdigado-think's thinking.
      const chunks = [
        'data: {"choices":[{"delta":{"reasoning":"Ich pruefe Spalte B."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Summe: "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"42"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseResponse(chunks));

      const res = await authedPost({ messages: MESSAGES, stream: true });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      // nginx buffers the whole stream without this, so the client sees nothing
      // until the answer is finished.
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toBe(chunks.join(''));
    });

    it('passes stream:true to the upstream', async () => {
      fetchMock.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
      const res = await authedPost({ messages: MESSAGES, stream: true });
      await res.text();

      expect(sentBody().stream).toBe(true);
    });

    it('hands the upstream an abort signal so a dropped client stops the bill', async () => {
      fetchMock.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
      const res = await authedPost({ messages: MESSAGES, stream: true });
      await res.text();

      expect(fetchMock.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('upstream failure', () => {
    it('is unavailable rather than broken when no upstream key is configured', async () => {
      // env.LITELLM_API_KEY is optional() in the schema and the shared provider
      // factory would send an empty Bearer; this path must fail early instead.
      envMock.LITELLM_API_KEY = undefined;
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falls back to the well-known host when no base url is configured', async () => {
      // Matches getLiteLLMProvider: a missing LITELLM_BASE_URL is a config
      // omission the rest of the app survives, so this path must too.
      envMock.LITELLM_BASE_URL = undefined;
      fetchMock.mockResolvedValueOnce(completionResponse());
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(200);
      expect(fetchMock.mock.calls[0]![0]).toBe(
        'https://litellm.netzbegruenung.verdigado.net/v1/chat/completions'
      );
    });

    it('does not double the /v1 when the base url already carries it', async () => {
      envMock.LITELLM_BASE_URL = 'https://litellm.test/v1';
      fetchMock.mockResolvedValueOnce(completionResponse());
      await authedPost({ messages: MESSAGES });

      expect(fetchMock.mock.calls[0]![0]).toBe('https://litellm.test/v1/chat/completions');
    });

    it('reports our own upstream 401 as a server fault, not the caller_s', async () => {
      // Passing a 401 through would tell the client to re-check a key that is
      // fine, while the actual problem is our LiteLLM credential.
      fetchMock.mockResolvedValueOnce(new Response('bad key', { status: 401 }));
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(502);
    });

    it('forwards an upstream 429 so the caller can back off', async () => {
      fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429 }));
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(429);
    });

    it('reports a network failure as a bad gateway', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await authedPost({ messages: MESSAGES });

      expect(res.status).toBe(502);
    });
  });
});
