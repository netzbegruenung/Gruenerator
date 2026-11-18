/**
 * `AiCall.reasoning` has to survive two layers before it reaches Melious:
 * the AI SDK maps the top-level `reasoning` to `reasoning_effort`, and
 * `meliousFetch` writes `none` when nothing is set. A request that asks to think
 * and silently goes out as `none` looks exactly like a working one, only faster
 * and worse — so this drives the real SDK and the real fetch wrapper and reads
 * the body off the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadExecute() {
  vi.resetModules();
  process.env.MELIOUS_API_KEY = 'test-key';
  return (await import('../execution/execute.js')).execute;
}

const COMPLETION = {
  id: 'x',
  object: 'chat.completion',
  created: 0,
  model: 'gemma-4-31b:speed',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hallo' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

let sent: Record<string, unknown>[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(COMPLETION), {
        headers: { 'content-type': 'application/json' },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

function request(options: Record<string, unknown>) {
  return {
    type: 'sharepic_creator',
    messages: [{ role: 'user' as const, content: 'Hallo' }],
    options: { model: 'gemma-4-31b:speed', ...options },
  };
}

describe('reasoning on the Melious wire', () => {
  it('goes out as reasoning_effort when the call asks to think', async () => {
    const execute = await loadExecute();
    await execute('melious', 'req', request({ reasoning: 'medium' }) as never);
    expect(sent[0]?.reasoning_effort).toBe('medium');
  });

  it('stays off when the call does not ask', async () => {
    const execute = await loadExecute();
    await execute('melious', 'req', request({}) as never);
    expect(sent[0]?.reasoning_effort).toBe('none');
  });
});
