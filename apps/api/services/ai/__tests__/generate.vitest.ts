/**
 * The typed facade. Tests drive it through a fake `executeProvider`, which is
 * the seam that matters: `generate.ts` must compose the SAME engine
 * `processRequest` uses, not reimplement generation next to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AiProviderError } from '../../providers/providerErrors.js';
import { GEMMA_31B_PRIMARY } from '../gemmaHosts.js';

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
    // `antrag` writes a finished text, so Gemma 4 is primary — auf welchem
    // Host, entscheidet services/ai/gemmaHosts.ts; die generische Kette
    // (litellm → regolo → mistral) führt danach mit litellm.
    expect(callAt(0).provider).toBe(GEMMA_31B_PRIMARY.provider);
    expect(callAt(1).provider).toBe('litellm');
  });

  it('lets each fallback answer on its own default model', async () => {
    // `providerFallback.getFallbackModelForProvider` is the rule: the primary's
    // model belongs to the primary. Posting the Gemma-Kennung at LiteLLM would
    // make every fallback attempt fail on an unknown model, i.e. a failover
    // chain that can never catch anything. Das ist nicht bloss theoretisch:
    // die beiden Gemma-Hosts schreiben denselben Modellnamen verschieden.
    executeProvider.mockResolvedValueOnce({ content: '', success: true });
    executeProvider.mockResolvedValueOnce(answered('Vom Fallback'));

    await aiText({ lane: 'antrag', prompt: 'x' });

    expect(callAt(0).data.options.model).toBe(GEMMA_31B_PRIMARY.model);
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
 * `processRequest` puts a wall clock over every call (`executeWithTimeout`).
 * The envelope has no timeout field, so migrating call sites carry that
 * expectation silently — a facade without it would drop their only ceiling
 * against a hung provider.
 */
describe('the wall clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const hang = () => new Promise(() => undefined);

  it('gives up on a provider that never answers', async () => {
    executeProvider.mockImplementation(hang);

    const failed = aiText({ lane: 'qa_draft', prompt: 'x' }).catch((e: unknown) => e as Error);
    await vi.advanceTimersByTimeAsync(120_000);

    const error = await failed;
    expect(error).toBeInstanceOf(NoAnswerError);
    expect(error.message).toContain('Request timeout after 120000ms');
  });

  it('covers the whole chain, not one attempt', async () => {
    // A per-attempt budget would let a three-provider chain run three times as
    // long as the caller allowed. Der Versuchsdeckel unten teilt das Budget
    // INNERHALB dieser Decke auf; überschreiten darf die Kette sie nicht.
    executeProvider.mockRejectedValueOnce(new Error('503')).mockImplementation(hang);

    const failed = aiText({ lane: 'antrag', prompt: 'x' }).catch((e: unknown) => e as Error);
    await vi.advanceTimersByTimeAsync(120_000);

    expect((await failed).message).toContain('timeout');
  });

  it('does not let a hung primary eat the whole budget', async () => {
    // Der Fehler vom 28.08.2026, in einem Test: `doc_generation` liegt auf
    // GreenPT, dessen eigene Frist (greenptThinkingFetch.ts) mit der Wanduhr
    // hier identisch ist. Vorher lief deshalb GENAU EIN Anbieter, die
    // Ausweichkette war tote Zeile, und der Aufruf endete nach 120 s mit 500.
    executeProvider.mockImplementation(hang);

    const failed = aiObject({
      lane: 'doc_generation',
      prompt: 'x',
      toolName: 'create_document',
      toolDescription: 'x',
      schema: {},
      validate: () => ({ ok: true, value: 1 }),
      attempts: 1,
    }).catch((e: unknown) => e as Error);

    // 40 s: fünf Anbieter, also legt `attemptBudget` den vier hinter dem
    // Primär je 20 s zurück.
    await vi.advanceTimersByTimeAsync(39_999);
    expect(executeProvider).toHaveBeenCalledTimes(1);

    // Als nächstes Cortecs, der einzige Host desselben Gemma 4 in dieser Kette.
    await vi.advanceTimersByTimeAsync(2);
    expect(executeProvider).toHaveBeenCalledTimes(2);
    expect(callAt(1).provider).toBe('cortecs');

    // Die Kette zu Ende laufen lassen, sonst wartet `failed` auf die drei
    // Anbieter dahinter.
    await vi.advanceTimersByTimeAsync(80_000);
    await failed;
  });

  it('gives every provider in a five-deep chain a turn, not just the next one', async () => {
    // Der Befund aus dem Review: eine FESTE Reserve garantiert immer genau
    // einen weiteren Zug, egal wie viele dahinter stehen. Mit 45 s fest lief
    // hier greenpt 75 s, cortecs 45 s — und litellm, regolo und mistral nie.
    executeProvider.mockImplementation(hang);

    const failed = aiText({ lane: 'doc_generation', prompt: 'x' }).catch(
      (e: unknown) => e as Error
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await failed;

    expect(executeProvider).toHaveBeenCalledTimes(5);
    expect([0, 1, 2, 3, 4].map((i) => callAt(i).provider)).toEqual([
      'greenpt',
      'cortecs',
      'litellm',
      'regolo',
      'mistral',
    ]);
  });

  it('never hands an attempt more time than the chain has left', async () => {
    // Latent, heute nicht erreichbar — nur ein knappes `AiCall.timeoutMs`
    // kommt dorthin, und der einzige konkrete Wert im Repo ist 240_000. Ohne
    // die Klemme im Boden von `attemptBudget` bekäme der dritte Versuch volle
    // 20 s, obwohl die ganze Kette nur noch 5 s hat: `abortSignal` und
    // Fehlertext lögen dann beide über die Zeit, die der Anbieter hatte.
    executeProvider.mockImplementation(hang);

    const failed = aiText({ lane: 'doc_generation', prompt: 'x', timeoutMs: 45_000 }).catch(
      (e: unknown) => e as Error
    );
    await vi.advanceTimersByTimeAsync(45_000);
    await failed;

    const budgets = executeProvider.mock.calls.map(
      (c) => (c[2] as { timeoutMs: number }).timeoutMs
    );
    // Der letzte bekommt den Rest, nicht den Boden — und die Summe bleibt 45 s.
    expect(budgets).toEqual([20_000, 20_000, 5_000]);
    expect(budgets.reduce((a, b) => a + b, 0)).toBe(45_000);
  });

  it('gives a shorter chain a more generous primary', async () => {
    // Richtig herum: der Primär ist das für die Lane GEWÄHLTE Modell und
    // beantwortet den Normalfall. `qa_draft` liegt auf Mistral, die Kette ist
    // vier tief — 120 − 3×20 = 60 s.
    executeProvider.mockImplementation(hang);

    const failed = aiText({ lane: 'qa_draft', prompt: 'x' }).catch((e: unknown) => e as Error);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(executeProvider).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_001);
    await failed;
    expect(executeProvider).toHaveBeenCalledTimes(4);
  });

  it('hands each attempt its own budget as the provider abort signal', async () => {
    // `execute.ts` macht daraus `AbortSignal.timeout` — ohne dieses Feld läuft
    // der aufgegebene Aufruf beim Anbieter weiter und wird zu Ende bezahlt.
    executeProvider.mockResolvedValue(answered('Antwort'));

    await aiText({ lane: 'qa_draft', prompt: 'x' });

    // Vier Anbieter: 120 − 3×20.
    expect(callAt(0).data.timeoutMs).toBe(60_000);
  });

  it('lets a caller name its own budget', async () => {
    // `agentPipeline` runs after the stream has closed; waiting is cheaper than
    // failing there, and its steps say so.
    executeProvider.mockImplementation(hang);

    const failed = aiText({ lane: 'qa_draft', prompt: 'x', timeoutMs: 240_000 }).catch(
      (e: unknown) => e as Error
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(120_000);

    expect((await failed).message).toContain('Request timeout after 240000ms');
  });

  it('does not fire once the answer is in', async () => {
    const answer = await aiText({ lane: 'qa_draft', prompt: 'x' });

    expect(answer).toBe('Antwort');
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * The family that cannot be routed: a `type` with no row in `AI_LANES` whose
 * provider and model were chosen by the caller against measurements in
 * `intermediateLanes.ts`. Without this the facade answers them on `default` and
 * logs each one as somebody's oversight.
 */
describe('pinned targets', () => {
  it('takes provider and model from the named intermediate stage', async () => {
    await aiText({ lane: 'chat_intent_classification', pinned: 'standard', prompt: 'x' });

    // Seit 29.08.2026 GreenPT statt Regolo — siehe „Warum Regolo nirgends mehr
    // vorne steht" im Kopf von intermediateLanes.ts.
    expect(callAt(0).provider).toBe('greenpt');
    expect(callAt(0).data.options.model).toBe('mistral-small-3.2-24b-instruct-2506');
  });

  it('takes a literal pair for the call sites that name one', async () => {
    await aiText({
      lane: 'text_adjustment',
      pinned: { provider: 'litellm', model: 'verdigado-pro' },
      prompt: 'x',
    });

    expect(callAt(0).provider).toBe('litellm');
    expect(callAt(0).data.options.model).toBe('verdigado-pro');
  });

  it('does not report an unrouted type as an oversight', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await aiText({ lane: 'chat_summarize_map', pinned: 'heavy', prompt: 'x' });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps the request type for sampling even though routing is bypassed', async () => {
    await aiText({ lane: 'chat_rerank', pinned: 'trivial', prompt: 'x' });

    expect(callAt(0).data.type).toBe('chat_rerank');
  });

  it('still fails over, on the generic chain and each provider’s own model', async () => {
    executeProvider.mockResolvedValueOnce({ content: '', success: true });
    executeProvider.mockResolvedValueOnce(answered('Vom Fallback'));

    await aiText({ lane: 'chat_quality_gate', pinned: 'standard', prompt: 'x' });

    // Die Fassaden-Kette ist GENERIC_FALLBACK ohne den Primär — mit GreenPT
    // vorne bleibt Cortecs der zweite Halt. Diese Kette ist NICHT die
    // `fallback`-Kette der Stufe: die greift auf dem direkten Weg
    // (`getIntermediateModel`), diese hier auf dem Fassaden-Weg.
    expect(callAt(0).provider).toBe('greenpt');
    expect(callAt(1).provider).toBe('cortecs');
    expect(callAt(1).data.options).not.toHaveProperty('model');
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
