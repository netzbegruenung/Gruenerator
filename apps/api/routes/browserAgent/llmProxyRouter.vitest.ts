/**
 * Der Modell-Endpunkt des Browser-Dienstes. Gewicht tragen die Prüfungen auf
 * das, was er verweigert (kein/falsches Run-Token, fremde Bild-URLs) und auf
 * das, was er an die Fassade weiterreicht — Lane, JSON-Modus, Bildteile und
 * die Nutzungszuordnung zur Person hinter dem Lauf.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiProviderError } from '../../services/providers/providerErrors.js';
import { getUsageUserId } from '../../utils/usageContext.js';

import type { AiCall } from '../../services/ai/generate.js';

const envMock = {
  BROWSER_AGENT_TOKEN_SECRET: 'test-token-secret' as string | undefined,
  BROWSER_AGENT_SECRET: 'test-service-secret' as string | undefined,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const aiTextMock = vi.fn<(call: AiCall) => Promise<string>>();
vi.mock('../../services/ai/generate.js', () => ({
  aiText: (call: AiCall) => aiTextMock(call),
}));

const { default: llmProxyRouter } = await import('./llmProxyRouter.js');
const { signRunToken } = await import('../../services/browserAgent/runToken.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  // Kein globaler Parser: der Router parst selbst, nach der Token-Prüfung.
  app.use('/api/browser-agent/llm', llmProxyRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  aiTextMock.mockReset();
  envMock.BROWSER_AGENT_TOKEN_SECRET = 'test-token-secret';
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function token(userId = 'u'): string {
  return signRunToken({ runId: 'run-1', userId, expiresAt: Date.now() + 60_000 });
}

function post(body: unknown, bearer: string | null = token()): Promise<Response> {
  return fetch(`${baseUrl}/api/browser-agent/llm/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer != null && { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  model: 'browser_agent',
  messages: [
    { role: 'system', content: 'Du bist ein Browser-Agent.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Was steht auf der Seite?' },
        { type: 'image_url', image_url: { url: PNG, detail: 'auto' } },
      ],
    },
  ],
  max_completion_tokens: 2048,
};

describe('POST /api/browser-agent/llm/v1/chat/completions', () => {
  it('401 without valid bearer', async () => {
    expect((await post(baseBody, null)).status).toBe(401);
    expect((await post(baseBody, 'nonsense')).status).toBe(401);
    const expired = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() - 1 });
    expect((await post(baseBody, expired)).status).toBe(401);
    expect(aiTextMock).not.toHaveBeenCalled();
  });

  it('503 when the token secret is not configured', async () => {
    const t = token();
    envMock.BROWSER_AGENT_TOKEN_SECRET = undefined;
    const res = await post(baseBody, t);
    expect(res.status).toBe(503);
    expect(aiTextMock).not.toHaveBeenCalled();
  });

  it('passes image_url parts and json flag to aiText on lane browser_agent', async () => {
    aiTextMock.mockResolvedValue('{"action":[]}');
    const schema = { type: 'object', properties: { action: { type: 'array' } } };
    const res = await post({
      ...baseBody,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'AgentOutput', strict: true, schema },
      },
    });
    expect(res.status).toBe(200);

    const call = aiTextMock.mock.calls[0]?.[0];
    expect(call?.lane).toBe('browser_agent');
    expect(call?.json).toBe(true);
    expect(call?.maxOutputTokens).toBe(2048);
    expect(call?.timeoutMs).toBe(75_000);
    const messages = call?.messages as Array<{ role: string; content: unknown }>;
    // Schema-Anweisung vorne, danach die Nachrichten von browser-use unverändert.
    expect(messages[0]?.role).toBe('system');
    expect(String(messages[0]?.content)).toContain('"action"');
    expect(messages[1]?.content).toBe('Du bist ein Browser-Agent.');
    const userParts = messages[2]?.content as Array<{ type: string }>;
    expect(userParts[1]?.type).toBe('image_url');

    const json = (await res.json()) as {
      object: string;
      model: string;
      choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    expect(json.object).toBe('chat.completion');
    expect(json.model).toBe('browser_agent');
    expect(json.choices[0]?.message).toEqual({ role: 'assistant', content: '{"action":[]}' });
    expect(json.choices[0]?.finish_reason).toBe('stop');
    expect(json.usage.total_tokens).toBeTypeOf('number');
  });

  it('plain text request: no json flag, no schema message, default budget', async () => {
    aiTextMock.mockResolvedValue('hallo');
    const res = await post({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    const call = aiTextMock.mock.calls[0]?.[0];
    expect(call?.json).toBe(false);
    expect(call?.maxOutputTokens).toBe(4096);
    expect(call?.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('json_object sets the json flag without a schema message', async () => {
    aiTextMock.mockResolvedValue('{}');
    await post({
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });
    const call = aiTextMock.mock.calls[0]?.[0];
    expect(call?.json).toBe(true);
    expect(call?.messages).toHaveLength(1);
  });

  it('rejects remote image URLs and malformed messages with 400', async () => {
    const remote = await post({
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'http://169.254.169.254/x.png' } }],
        },
      ],
    });
    expect(remote.status).toBe(400);
    expect((await post({ messages: [{ role: 'tool', content: 'x' }] })).status).toBe(400);
    expect((await post({ messages: [] })).status).toBe(400);
    expect(aiTextMock).not.toHaveBeenCalled();
  });

  it('maps AiProviderError to 502 with OpenAI error body', async () => {
    aiTextMock.mockRejectedValue(
      new AiProviderError('upstream 503 with secret details', {
        code: 'provider_unavailable',
        retryable: true,
      })
    );
    const res = await post(baseBody);
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { message: string; type: string } };
    expect(json.error.type).toBe('provider_error');
    expect(json.error.message).toBeTypeOf('string');
    expect(JSON.stringify(json)).not.toContain('at ');
  });

  it('maps a rate-limited AiProviderError to 429', async () => {
    aiTextMock.mockRejectedValue(
      new AiProviderError('slow down', { code: 'rate_limited', retryable: true })
    );
    expect((await post(baseBody)).status).toBe(429);
  });

  it('runs aiText inside usage context of the token user', async () => {
    let seen: string | null = null;
    aiTextMock.mockImplementation(() => {
      seen = getUsageUserId();
      return Promise.resolve('ok');
    });
    await post(baseBody, token('u'));
    expect(seen).toBe('u');
  });
});
