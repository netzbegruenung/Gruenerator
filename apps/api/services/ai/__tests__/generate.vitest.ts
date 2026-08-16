/**
 * The typed facade. Tests drive it through a fake `executeProvider`, which is
 * the seam that matters: `generate.ts` must compose the SAME engine
 * `processRequest` uses, not reimplement generation next to it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AiProviderError } from '../../providers/providerErrors.js';

const executeProvider = vi.fn();

vi.mock('../execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { aiText, aiObject, aiTools, NoAnswerError } = await import('../generate.js');

/** What the fake was asked to run: provider and the request envelope. */
function callAt(i: number) {
  const [provider, , data] = executeProvider.mock.calls[i] as [string, string, Record<string, any>];
  return { provider, data };
}

const answered = (content: string) => ({ content, success: true, stop_reason: 'stop' });

beforeEach(() => {
  vi.clearAllMocks();
  executeProvider.mockResolvedValue(answered('Antwort'));
});

describe('aiText', () => {
  it('returns the text, not an envelope', async () => {
    await expect(aiText({ lane: 'qa_draft', prompt: 'Frage' })).resolves.toBe('Antwort');
  });

  it('routes through the lane registry', async () => {
    await aiText({ lane: 'sharepic_zitat', prompt: 'Slogan' });

    expect(callAt(0).provider).toBe('mistral');
    expect(callAt(0).data.options.model).toBe('mistral-medium-2604');
    expect(callAt(0).data.type).toBe('sharepic_zitat');
  });

  it('sends an unknown lane down the default lane rather than failing', async () => {
    await aiText({ lane: 'brandneu', prompt: 'x' });
    expect(callAt(0).provider).toBe('mistral');
  });

  it('hands the engine the request type, not the lane it resolved to', async () => {
    // The type decides sampling as well as routing, and the sampling table
    // (services/ai/config.ts) knows names AI_LANES does not: `web_search_summary`
    // is 0.2 there. Substituting the resolved lane would sample it at the 0.35
    // catch-all — a silent re-tuning of every unrouted call site that migrates.
    await aiText({ lane: 'web_search_summary', prompt: 'x' });

    expect(callAt(0).data.type).toBe('web_search_summary');
    expect(callAt(0).provider).toBe('mistral');
  });

  it('turns a prompt into a single user turn', async () => {
    await aiText({ lane: 'qa_draft', system: 'Sei knapp.', prompt: 'Frage' });

    expect(callAt(0).data.systemPrompt).toBe('Sei knapp.');
    expect(callAt(0).data.messages).toEqual([{ role: 'user', content: 'Frage' }]);
  });

  it('passes sampling through under the wire names the engine expects', async () => {
    await aiText({ lane: 'qa_draft', prompt: 'x', temperature: 0, maxOutputTokens: 80, topP: 0.5 });

    expect(callAt(0).data.options).toMatchObject({
      temperature: 0,
      max_tokens: 80,
      top_p: 0.5,
    });
  });

  it('asks for JSON mode under the wire name the adapter reads', async () => {
    // `execute.ts` wraps the model in defaultSettingsMiddleware on exactly this
    // option; a call site that migrates without it drops back to prompt-only
    // JSON without any signal.
    await aiText({ lane: 'doc_generation', prompt: 'x', json: true });

    expect(callAt(0).data.options.response_format).toEqual({ type: 'json_object' });
  });

  it('leaves response_format off when JSON mode was not asked for', async () => {
    await aiText({ lane: 'doc_generation', prompt: 'x' });

    expect(callAt(0).data.options).not.toHaveProperty('response_format');
  });

  it('falls over to the next provider when one answers with nothing', async () => {
    // Empty counts as failure, same rule providerFallback applies: a provider
    // that says nothing has not answered.
    executeProvider.mockResolvedValueOnce({ content: '', success: true });
    executeProvider.mockResolvedValueOnce(answered('Vom Fallback'));

    await expect(aiText({ lane: 'antrag', prompt: 'x' })).resolves.toBe('Vom Fallback');
    // `antrag` writes a finished text, so Gemma 4 on Regolo is primary; the
    // generic chain (litellm → regolo → mistral) then leads with litellm.
    expect(callAt(0).provider).toBe('regolo');
    expect(callAt(1).provider).toBe('litellm');
  });

  it('lets each fallback answer on its own default model', async () => {
    // `providerFallback.getFallbackModelForProvider` is the rule: the primary's
    // model belongs to the primary. Posting `gemma4-31b` at LiteLLM would make
    // every fallback attempt fail on an unknown model, i.e. a failover chain
    // that can never catch anything.
    executeProvider.mockResolvedValueOnce({ content: '', success: true });
    executeProvider.mockResolvedValueOnce(answered('Vom Fallback'));

    await aiText({ lane: 'antrag', prompt: 'x' });

    expect(callAt(0).data.options.model).toBe('gemma4-31b');
    expect(callAt(1).data.options).not.toHaveProperty('model');
  });

  it('falls over when one throws', async () => {
    executeProvider.mockRejectedValueOnce(new Error('503'));
    executeProvider.mockResolvedValueOnce(answered('Vom Fallback'));

    await expect(aiText({ lane: 'antrag', prompt: 'x' })).resolves.toBe('Vom Fallback');
  });

  it('never retries the primary as its own fallback', async () => {
    executeProvider.mockResolvedValue({ content: '', success: true });

    await aiText({ lane: 'sharepic_zitat', prompt: 'x' }).catch(() => undefined);

    const providers = executeProvider.mock.calls.map((c) => c[0]);
    expect(new Set(providers).size).toBe(providers.length);
    expect(providers[0]).toBe('mistral');
  });

  it('reports the last provider error as the cause when everything fails', async () => {
    const boom = Object.assign(new Error('Bad Gateway'), { statusCode: 503 });
    executeProvider.mockRejectedValue(boom);

    const error = await aiText({ lane: 'qa_draft', prompt: 'x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NoAnswerError);
    expect((error as Error).cause).toBe(boom);
  });
});

/**
 * The route layer branches on `code`/`retryable`, never on the message. A
 * failure that arrives here as a plain `Error` reaches the client as a bare
 * `internal`, which is exactly what the retired worker pool left behind — so
 * these assert the classification, not just that something was thrown.
 */
describe('provider failures arrive typed', () => {
  const failWith = (error: unknown) => {
    executeProvider.mockRejectedValue(error);
    return aiText({ lane: 'qa_draft', prompt: 'x' }).catch((e: unknown) => e as AiProviderError);
  };

  it('is an AiProviderError, so callers can branch without parsing strings', async () => {
    const error = await failWith(Object.assign(new Error('nope'), { statusCode: 503 }));
    expect(error).toBeInstanceOf(AiProviderError);
  });

  it('classifies a rate limit as retryable', async () => {
    const error = await failWith(Object.assign(new Error('Too Many Requests'), { status: 429 }));

    expect(error.code).toBe('rate_limited');
    expect(error.retryable).toBe(true);
    expect(error.statusCode).toBe(429);
  });

  it('classifies a provider outage as retryable', async () => {
    const error = await failWith(Object.assign(new Error('Bad Gateway'), { statusCode: 502 }));

    expect(error.code).toBe('provider_unavailable');
    expect(error.retryable).toBe(true);
  });

  it('classifies a rejected request as not retryable', async () => {
    const error = await failWith(Object.assign(new Error('Bad Request'), { statusCode: 400 }));

    expect(error.code).toBe('invalid_request');
    expect(error.retryable).toBe(false);
  });

  it('reads the status through the cause chain the adapters wrap', async () => {
    const inner = Object.assign(new Error('upstream'), { statusCode: 429 });
    const error = await failWith(new Error('adapter failed', { cause: inner }));

    expect(error.code).toBe('rate_limited');
  });

  it('classifies an all-empty chain as unknown rather than mislabelling it', async () => {
    // Nobody threw — every provider answered with nothing. That is a failure,
    // but not a provider fault, so it must not claim to be retryable.
    executeProvider.mockResolvedValue({ content: '', success: true });

    const error = await aiText({ lane: 'qa_draft', prompt: 'x' }).catch(
      (e: unknown) => e as AiProviderError
    );

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.code).toBe('unknown');
    expect(error.retryable).toBe(false);
  });
});

describe('aiObject', () => {
  const base = {
    lane: 'website' as const,
    prompt: 'Baue die Seite',
    schema: { type: 'object' },
    toolName: 'build_site',
    toolDescription: 'Baut die Seite',
  };

  const toolCall = (input: unknown) => ({
    content: null,
    success: true,
    stop_reason: 'tool_use',
    tool_calls: [{ id: 'c1', name: 'build_site', input }],
  });

  it('forces the tool call', async () => {
    executeProvider.mockResolvedValue(toolCall({ hero: 'x' }));

    await aiObject({ ...base, validate: (v) => ({ ok: true, value: v as { hero: string } }) });

    expect(callAt(0).data.options.tool_choice).toBe('required');
    expect(callAt(0).data.options.tools[0].name).toBe('build_site');
  });

  it('returns the validated value', async () => {
    executeProvider.mockResolvedValue(toolCall({ hero: 'Titel' }));

    const result = await aiObject<{ hero: string }>({
      ...base,
      validate: (v) => ({ ok: true, value: v as { hero: string } }),
    });

    expect(result).toEqual({ ok: true, data: { hero: 'Titel' } });
  });

  it('repairs once, quoting the concrete complaint, at temperature 0', async () => {
    // The reason this is a forced tool call rather than generateObject: the
    // rejection is semantic, not schematic — the object parses fine, its
    // contents are wrong for the context.
    executeProvider.mockResolvedValueOnce(toolCall({ kind: 'rotate' }));
    executeProvider.mockResolvedValueOnce(toolCall({ kind: 'setText' }));

    let seen = 0;
    const result = await aiObject<{ kind: string }>({
      ...base,
      validate: (v) => {
        seen += 1;
        const value = v as { kind: string };
        return value.kind === 'setText'
          ? { ok: true, value }
          : { ok: false, error: 'Erlaubt sind ausschließlich: setText' };
      },
    });

    expect(seen).toBe(2);
    expect(result).toEqual({ ok: true, data: { kind: 'setText' } });

    const repair = callAt(1).data;
    expect(repair.options.temperature).toBe(0);
    expect(JSON.stringify(repair.messages)).toContain('Erlaubt sind ausschließlich: setText');
  });

  it('gives up with the last complaint after the attempt budget', async () => {
    executeProvider.mockResolvedValue(toolCall({ kind: 'rotate' }));

    const result = await aiObject({
      ...base,
      validate: () => ({ ok: false as const, error: 'nicht erlaubt' }),
    });

    expect(result).toEqual({ ok: false, error: 'nicht erlaubt' });
  });

  it('reads a tool call out of raw_content_blocks too', async () => {
    executeProvider.mockResolvedValue({
      content: null,
      success: true,
      stop_reason: 'tool_use',
      raw_content_blocks: [{ type: 'tool_use', name: 'build_site', input: { hero: 'y' } }],
    });

    const result = await aiObject<{ hero: string }>({
      ...base,
      validate: (v) => ({ ok: true, value: v as { hero: string } }),
    });

    expect(result).toEqual({ ok: true, data: { hero: 'y' } });
  });

  it('falls back to prose parsing when the model ignores the tool', async () => {
    // Keeps this a strict superset of the prompt-and-parse it replaces.
    executeProvider.mockResolvedValue(answered('{"hero":"aus Prosa"}'));

    const result = await aiObject<{ hero: string }>({
      ...base,
      validate: (v) => ({ ok: true, value: v as { hero: string } }),
      parseText: (t) => JSON.parse(t) as { hero: string },
    });

    expect(result).toEqual({ ok: true, data: { hero: 'aus Prosa' } });
  });
});

describe('aiTools', () => {
  it('returns the result as-is instead of re-shaping it', async () => {
    const raw = {
      content: null,
      success: true,
      stop_reason: 'tool_use',
      tool_calls: [{ id: 'c1', name: 'web_search', input: { query: 'Radweg' } }],
    };
    executeProvider.mockResolvedValue(raw);

    const result = await aiTools({
      lane: 'qa_tools',
      prompt: 'Suche',
      tools: [{ name: 'web_search', description: 'Sucht', input_schema: { type: 'object' } }],
      toolChoice: 'auto',
    });

    expect(result).toBe(raw);
    expect(callAt(0).data.options.tool_choice).toBe('auto');
  });
});
