import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: { MELIOUS_API_KEY: 'm-key', GREENPT_API_KEY: 'g-key' },
}));

import { AiProviderError } from '../../providers/providerErrors.js';
import { aiDecide, type ChoiceQuestion } from '../decide.js';

const QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions: 'Stimmt das?',
  criteria: { ja: 'stimmt', nein: 'stimmt nicht' },
};
const call = { label: 'test', state: 'QUELLE: x', questions: { q: QUESTION } };
const answer = (choice: string) =>
  new Response(
    JSON.stringify({
      answers: { q: { type: 'choice', choice, confidence: 0.9, probabilities: {} } },
    }),
    { status: 200 }
  );

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const hostOf = (i: number) => String(fetchMock.mock.calls[i]![0]);

describe('aiDecide', () => {
  it('asks Clef Flash on Melious first and nothing else when it answers', async () => {
    fetchMock.mockResolvedValueOnce(answer('ja'));
    const answers = await aiDecide(call);
    expect(answers.q.choice).toBe('ja');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hostOf(0)).toBe('https://api.melious.ai/v1/systemone');
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { model: string };
    expect(body.model).toBe('clef-flash');
  });

  it('falls over to Metis on GreenPT when Melious fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429 })
      )
      .mockResolvedValueOnce(answer('nein'));
    const answers = await aiDecide(call);
    expect(answers.q.choice).toBe('nein');
    expect(hostOf(1)).toBe('https://api.greenpt.ai/v1/systemone');
  });

  it('hedges to Metis when Melious is slow, and takes whoever answers first', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(answer('nein'));
    const pending = aiDecide(call);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toMatchObject({ q: { choice: 'nein' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a classified AiProviderError when no host answers', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('busy', { status: 429 })));
    const error = await aiDecide(call).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('treats an answer missing a question as a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ answers: {} }), { status: 200 }))
      .mockResolvedValueOnce(answer('ja'));
    await expect(aiDecide(call)).resolves.toMatchObject({ q: { choice: 'ja' } });
  });

  it('refuses a request over the model limits before sending it', async () => {
    const error = await aiDecide({ ...call, state: 'x'.repeat(13_000) }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
