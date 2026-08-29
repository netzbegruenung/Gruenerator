/**
 * Dass jede Zwischenstufe ein Netz HAT, und dass das Netz trägt.
 *
 * Der Anlass steht in `intermediateLanes.ts`: am 29.08.2026 wies Regolo die
 * Auto-Verschlagwortung mit HTTP 402 (`trial_expired`) ab, und weil
 * `getIntermediateModel()` an der Fassade und damit an `providerFallback.ts`
 * vorbeigeht, gab der Aufrufer still auf.
 */

import { describe, expect, it } from 'vitest';

import { withFallbackChain } from '../fallbackModel.js';
import { INTERMEDIATE_LANES } from '../intermediateLanes.js';

/** Abgeleitet statt importiert — `ai` exportiert `LanguageModelV4` nicht;
 *  dieselbe Begründung wie in `fallbackModel.ts`. */
type LaneModel = Exclude<Parameters<typeof withFallbackChain>[0], string>;
type Callable = {
  doGenerate: (params: unknown) => Promise<{ content: unknown }>;
  doStream: (params: unknown) => Promise<unknown>;
};

type Outcome = { kind: 'text'; text: string } | { kind: 'empty' } | { kind: 'throw'; error: Error };

/** Ein Modell, das genau das tut, was der Test ihm sagt — und mitzählt. */
function fakeModel(id: string, outcome: Outcome) {
  const calls = { generate: 0, stream: 0 };
  const answer = () => {
    calls.generate += 1;
    if (outcome.kind === 'throw') return Promise.reject(outcome.error);
    return Promise.resolve({
      content: outcome.kind === 'text' ? [{ type: 'text', text: outcome.text }] : [],
      finishReason: outcome.kind === 'text' ? 'stop' : 'length',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    });
  };

  const model = {
    specificationVersion: 'v3',
    provider: 'fake',
    modelId: id,
    supportedUrls: {},
    doGenerate: answer,
    doStream: () => {
      calls.stream += 1;
      if (outcome.kind === 'throw') return Promise.reject(outcome.error);
      return Promise.resolve({ stream: new ReadableStream(), request: {}, response: {} });
    },
  } as unknown as LaneModel;

  return { model, calls };
}

async function generate(model: ReturnType<typeof withFallbackChain>) {
  return (model as unknown as Callable).doGenerate({ prompt: [] });
}

describe('withFallbackChain', () => {
  it('lets the primary answer and never touches the chain', async () => {
    const primary = fakeModel('primary', { kind: 'text', text: 'ok' });
    const backup = fakeModel('backup', { kind: 'text', text: 'unused' });

    const result = await generate(withFallbackChain(primary.model, [backup.model], 'test'));

    expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(backup.calls.generate).toBe(0);
  });

  it('moves on when the primary throws — the 402 that started this', async () => {
    const err = Object.assign(new Error('Daily token limit exceeded or trial expired.'), {
      statusCode: 402,
    });
    const primary = fakeModel('regolo', { kind: 'throw', error: err });
    const backup = fakeModel('greenpt', { kind: 'text', text: '["klimaschutz"]' });

    const result = await generate(withFallbackChain(primary.model, [backup.model], 'test'));

    expect(result.content).toEqual([{ type: 'text', text: '["klimaschutz"]' }]);
    expect(backup.calls.generate).toBe(1);
  });

  it('moves on when the primary succeeds with empty content', async () => {
    // Die Ausfallart, die eine reine Ausnahmebehandlung nicht sieht: ein
    // Reasoning-Modell verbrennt das kleine Ausgabebudget im `reasoning`-Feld
    // und liefert content: [] bei finishReason 'length'.
    const primary = fakeModel('gpt-oss', { kind: 'empty' });
    const backup = fakeModel('greenpt', { kind: 'text', text: 'echte antwort' });

    const result = await generate(withFallbackChain(primary.model, [backup.model], 'test'));

    expect(result.content).toEqual([{ type: 'text', text: 'echte antwort' }]);
  });

  it('walks the whole chain and rethrows the LAST provider error', async () => {
    const first = fakeModel('a', { kind: 'throw', error: new Error('first down') });
    const second = fakeModel('b', { kind: 'throw', error: new Error('second down') });
    const third = fakeModel('c', { kind: 'throw', error: new Error('third down') });

    // Der letzte echte Fehler, nicht eine zusammengefasste Prosa: NoAnswerError
    // läuft die cause-Kette entlang und braucht den Statuscode.
    await expect(
      generate(withFallbackChain(first.model, [second.model, third.model], 'test'))
    ).rejects.toThrow('third down');
    expect(second.calls.generate).toBe(1);
    expect(third.calls.generate).toBe(1);
  });

  it('returns the primary untouched when there is nothing to fall back to', () => {
    const primary = fakeModel('solo', { kind: 'text', text: 'ok' });
    expect(withFallbackChain(primary.model, [], 'test')).toBe(primary.model);
  });

  it('falls back on a stream that never starts', async () => {
    const primary = fakeModel('a', { kind: 'throw', error: new Error('down') });
    const backup = fakeModel('b', { kind: 'text', text: 'ok' });

    const model = withFallbackChain(primary.model, [backup.model], 'test');
    await (model as unknown as Callable).doStream({ prompt: [] });

    expect(backup.calls.stream).toBe(1);
  });
});

describe('INTERMEDIATE_LANES fallback chains', () => {
  const lanes = Object.entries(INTERMEDIATE_LANES);

  it.each(lanes)('%s declares a non-empty chain', (_name, config) => {
    expect(config.fallback.length).toBeGreaterThan(0);
  });

  it.each(lanes)('%s never repeats a provider within its chain', (_name, config) => {
    const providers = [config.provider, ...config.fallback.map((t) => t.provider)];
    // Ein zweites Modell beim selben Anbieter ist kein Netz: der Vorfall vom
    // 29.08.2026 war ein KONTO-Limit und hätte beide Ziele gleich getroffen.
    expect(new Set(providers).size).toBe(providers.length);
  });

  it('never puts regolo first on any stage', () => {
    // Festgehalten am 29.08.2026, nachdem Regolo als Primär von `trivial` und
    // `standard` mit HTTP 402 (`trial_expired`) abwies und die Stufen ohne
    // Antwort dastanden. Regolo bleibt als letztes Kettenglied nützlich —
    // vorne steht es nicht mehr.
    for (const [name, config] of lanes) {
      expect(config.provider, `${name} must not lead with regolo`).not.toBe('regolo');
    }
  });

  it('keeps the small stages on one model across three hosts', () => {
    // Ein Hostwechsel darf die Antwortqualität nicht mit umschalten. Die ersten
    // drei Glieder tragen deshalb dieselben Gewichte; erst das vierte wechselt
    // das Modell.
    for (const lane of ['trivial', 'standard'] as const) {
      const config = INTERMEDIATE_LANES[lane];
      const models = [config.model, ...config.fallback.map((t) => t.model)];
      expect(models.slice(0, 2)).toEqual([
        'mistral-small-3.2-24b-instruct-2506',
        'mistral-small-3.2-24b-instruct-2506',
      ]);
    }
  });

  it('keeps the reasoning lane out of the small-budget stages', () => {
    // gpt-oss über litellm/verdigado-pro liefert bei maxOutputTokens 16–40
    // leeren content — siehe die Messreihe im Kopf von intermediateLanes.ts.
    for (const lane of ['trivial', 'standard'] as const) {
      const models = INTERMEDIATE_LANES[lane].fallback.map((t) => t.model);
      expect(models).not.toContain('verdigado-pro');
    }
  });
});
