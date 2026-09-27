/**
 * Mistral Medium 3.5 runs on Scaleway with the Mistral API as fallback.
 *
 * Two levels are tested here, because they answer different failures:
 *   - `routeMistralModel` — CONFIGURATION time. No Scaleway key, no Scaleway.
 *   - `scalewayFetchWithMistralFallback` — REQUEST time. Scaleway is configured
 *     but did not answer.
 *
 * The env is manipulated through `vi.resetModules()` + dynamic import because
 * `config/env.js` parses `process.env` once at import time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadRouting(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../providerInstances.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('routeMistralModel', () => {
  it('sends every Mistral Medium 3.5 alias to Scaleway', async () => {
    const { routeMistralModel } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: 'true',
    });

    // All three ids name the same weights; the codebase uses all three
    // (mistral-medium-2604 in the lane tables, mistral-medium-3.5 in the
    // catalog). Missing one would leave that caller on the Mistral API.
    for (const id of ['mistral-medium-2604', 'mistral-medium-3.5', 'mistral-medium-latest']) {
      expect(routeMistralModel(id)).toEqual({
        upstream: 'scaleway',
        model: 'mistral-medium-3.5-128b',
      });
    }
  });

  it('leaves the other Mistral models on the Mistral API', async () => {
    const { routeMistralModel } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: 'true',
    });

    // This Scaleway project serves neither Pixtral nor the embedding models, so
    // a `startsWith('mistral-')` rule would have broken vision and search.
    for (const id of ['pixtral-large-latest', 'mistral-small-latest', 'mistral-embed']) {
      expect(routeMistralModel(id)).toEqual({ upstream: 'mistral', model: id });
    }
  });

  it('keeps thinking requests on the Mistral API', async () => {
    // Measured 2026-07-30: the Scaleway lane is reached through @ai-sdk/openai,
    // which never receives a `providerOptions.mistral` block — the effort would
    // be dropped silently. Forcing `reasoning_effort` through raw is worse: the
    // chain of thought lands in `message.reasoning`, which the SDK does not
    // read, while still billing against max_tokens, so `content` comes back
    // EMPTY. Reasoning therefore belongs on @ai-sdk/mistral.
    const { routeMistralModel } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: 'true',
    });

    expect(routeMistralModel('mistral-medium-2604', { needsReasoning: true })).toEqual({
      upstream: 'mistral',
      model: 'mistral-medium-2604',
    });
    // …but only when reasoning is actually asked for.
    expect(routeMistralModel('mistral-medium-2604', { needsReasoning: false }).upstream).toBe(
      'scaleway'
    );
    expect(routeMistralModel('mistral-medium-2604', {}).upstream).toBe('scaleway');
  });

  it('stays on the Mistral API when the routing flag is off, key or no key', async () => {
    // Der Standardzustand seit 2026-08-13: Scaleway lieferte fehlerhafte
    // Antworten. Der Schlüssel darf gesetzt bleiben — Gemma 4 braucht ihn —,
    // der Schalter allein entscheidet über das Hauptmodell.
    const { routeMistralModel, isScalewayMistralRoutingEnabled } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: undefined,
    });

    expect(isScalewayMistralRoutingEnabled()).toBe(false);
    for (const id of ['mistral-medium-2604', 'mistral-medium-3.5', 'mistral-medium-latest']) {
      expect(routeMistralModel(id)).toEqual({ upstream: 'mistral', model: id });
    }
  });

  it('falls back to Mistral when Scaleway is not configured', async () => {
    const { routeMistralModel } = await loadRouting({
      SCALEWAY_API_KEY: undefined,
      SCALEWAY_MISTRAL_ROUTING: 'true',
    });

    expect(routeMistralModel('mistral-medium-2604')).toEqual({
      upstream: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  it('reports the mistral lane as configured when only Scaleway has a key', async () => {
    // A Scaleway-only deployment is valid: the lane still answers. Reporting it
    // unconfigured would make fallback chains skip it entirely.
    const { isProviderConfigured } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: 'true',
      MISTRAL_API_KEY: undefined,
    });

    expect(isProviderConfigured('mistral')).toBe(true);
    expect(isProviderConfigured('scaleway')).toBe(true);
  });

  it('reports the mistral lane UNconfigured when only Scaleway has a key and routing is off', async () => {
    // The Scaleway key stops vouching for this lane the moment the routing is
    // off: every request goes to the Mistral API, which has no key here. Saying
    // "configured" would make fallback chains pick a lane that cannot answer —
    // and Scaleway is still legitimately configured for Gemma, so the key alone
    // is no longer the question.
    const { isProviderConfigured } = await loadRouting({
      SCALEWAY_API_KEY: 'scw-key',
      SCALEWAY_MISTRAL_ROUTING: undefined,
      MISTRAL_API_KEY: undefined,
    });

    expect(isProviderConfigured('mistral')).toBe(false);
    expect(isProviderConfigured('scaleway')).toBe(true);
  });
});

describe('scalewayFetchWithMistralFallback', () => {
  const CHAT_URL = 'https://api.scaleway.ai/project-id/v1/chat/completions';
  const BODY = JSON.stringify({
    model: 'mistral-medium-3.5-128b',
    messages: [{ role: 'user', content: 'hi' }],
  });

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  async function load(
    env: Record<string, string | undefined> = { MISTRAL_API_KEY: 'mistral-key' }
  ) {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const mod = await import('../scalewayMistralFallbackFetch.js');
    return mod.scalewayFetchWithMistralFallback;
  }

  it('passes a successful response straight through', async () => {
    const ok = new Response('{}', { status: 200 });
    fetchMock.mockResolvedValueOnce(ok);

    const doFetch = await load();
    await expect(doFetch(CHAT_URL, { method: 'POST', body: BODY })).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays a 5xx against Mistral with the model id remapped', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream boom', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const doFetch = await load();
    const res = await doFetch(CHAT_URL, {
      method: 'POST',
      body: BODY,
      headers: { Authorization: 'Bearer scw-key' },
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    // The Mistral API does not know the Scaleway id, and would 400 on it.
    const replayed = JSON.parse(init.body as string) as { model: string };
    expect(replayed.model).toBe('mistral-medium-2604');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer mistral-key');
  });

  it('replays a 404, because a retired model id takes the lane down', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('no such model', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const doFetch = await load();
    await doFetch(CHAT_URL, { method: 'POST', body: BODY });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT replay an auth failure', async () => {
    // A bad Scaleway key must stay loud. Silently shifting the whole load onto
    // Mistral would hide it until the invoice arrives.
    const unauthorized = new Response('bad key', { status: 401 });
    fetchMock.mockResolvedValueOnce(unauthorized);

    const doFetch = await load();
    await expect(doFetch(CHAT_URL, { method: 'POST', body: BODY })).resolves.toBe(unauthorized);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays a transport failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const doFetch = await load();
    const res = await doFetch(CHAT_URL, { method: 'POST', body: BODY });

    expect(res.status).toBe(200);
  });

  it('does NOT replay an aborted request', async () => {
    // The caller hung up. Replaying runs — and bills — a request nobody awaits.
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abort);

    const doFetch = await load();
    await expect(doFetch(CHAT_URL, { method: 'POST', body: BODY })).rejects.toThrow(abort);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the failure when there is no Mistral key to fall back to', async () => {
    const failed = new Response('boom', { status: 500 });
    fetchMock.mockResolvedValueOnce(failed);

    const doFetch = await load({ MISTRAL_API_KEY: undefined });
    await expect(doFetch(CHAT_URL, { method: 'POST', body: BODY })).resolves.toBe(failed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT substitute a different model for a Scaleway-only lane', async () => {
    // gpt-oss has no Mistral equivalent. Answering with some other model would
    // be worse than failing.
    const failed = new Response('boom', { status: 500 });
    fetchMock.mockResolvedValueOnce(failed);

    const doFetch = await load();
    const res = await doFetch(CHAT_URL, {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-oss-120b', messages: [] }),
    });

    expect(res).toBe(failed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the endpoint path when replaying', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const doFetch = await load();
    await doFetch('https://api.scaleway.ai/project-id/v1/embeddings', {
      method: 'POST',
      body: BODY,
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.mistral.ai/v1/embeddings');
  });
});
