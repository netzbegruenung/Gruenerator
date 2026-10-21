import { sharepicBackgroundSchema, sharepicItemSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { DraftFailedError, draftSharepic, lacksStructure } from './draftAgent.js';
import { draftFailedBody } from './draftFailure.js';

interface DraftCall {
  schema: Record<string, unknown>;
  pinned: { provider: string; model: string };
  attempts: number;
  validate: (input: unknown, attempt: number, attempts: number) => { ok: boolean };
}

const needs = {
  ok: true,
  data: {
    land: 'de-DE',
    anlass: [],
    kapitel: [],
    fotos_suchen: [],
    form: 'einzelbild',
    alternativen: [],
  },
};

// What Gemma on Melious and Cortecs answered on 21.10.2026 for every draft.
const EMPTY = {
  slides: [{ align: 'links', background: {}, items: [{}], logo: true, position: 'oben' }],
};

const GOOD = {
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      logo: true,
      items: [{ type: 'headline', lines: ['Mehr Busse', 'für alle'] }],
    },
  ],
};

/** A draft with its structure in place and its content wrong: a headline without lines. */
const BROKEN = {
  slides: [{ ...GOOD.slides[0]!, items: [{ type: 'headline', lines: [] }] }],
};

/** Runs the call's own validator on `input`, as `aiObject` does. */
const answer = (input: unknown) => (call: DraftCall) => {
  const checked = call.validate(input, call.attempts, call.attempts) as
    { ok: true; value: unknown } | { ok: false; error: string };
  return Promise.resolve(
    checked.ok ? { ok: true, data: checked.value } : { ok: false, error: checked.error }
  );
};

const draftCalls = () => aiObject.mock.calls.slice(1).map(([call]) => call as DraftCall);

beforeEach(() => {
  aiObject.mockReset();
});

describe('the draft tool schema', () => {
  const schemaOf = async (locale: 'de-DE' | 'de-AT') => {
    aiObject.mockResolvedValueOnce(needs).mockResolvedValue({ ok: false, error: 'stop' });
    await draftSharepic('Sharepic zur Mitgliederwerbung', locale).catch(() => null);
    return draftCalls()[0]!.schema;
  };

  const walk = (node: unknown, visit: (n: Record<string, unknown>) => void): void => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
    if (!node || typeof node !== 'object') return;
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  };

  it.each(['de-DE', 'de-AT'] as const)('declares every object it asks for (%s)', async (locale) => {
    // A forced tool call decodes an object without `properties` to `{}`.
    const open: unknown[] = [];
    walk(await schemaOf(locale), (n) => {
      if (n.type === 'object' && !n.properties && !n.anyOf) open.push(n);
    });
    expect(open).toEqual([]);
  });

  it('leaves content limits to the validator', async () => {
    // A grammar would cut a 25-character headline line mid-word instead of asking for a repair.
    const limits: string[] = [];
    walk(await schemaOf('de-DE'), (n) => {
      for (const key of ['maxLength', 'maxItems', 'pattern', 'exclusiveMinimum'])
        if (key in n && typeof n[key] !== 'object') limits.push(key);
    });
    expect(limits).toEqual([]);
  });

  it('offers every background, the scene included, and every item', async () => {
    const slide = ((await schemaOf('de-DE')).properties as Record<string, any>).slides.items;
    const kinds = slide.properties.background.anyOf.map(
      (v: { properties: { kind: { const: string } } }) => v.properties.kind.const
    );
    expect(kinds).toEqual([
      ...sharepicBackgroundSchema.options.map((o) => o.shape.kind.value),
      'szene',
    ]);
    const types = slide.properties.items.items.anyOf.map(
      (v: { properties: { type: { const: string } } }) => v.properties.type.const
    );
    expect(types).toEqual(sharepicItemSchema.options.map((o) => o.shape.type.value));
    expect(slide.properties.datum.properties).toHaveProperty('date');
    expect(slide.properties.ort.properties).toHaveProperty('lines');
  });
});

describe('a draft Gemma cannot finish', () => {
  it('gets one round on another model', async () => {
    aiObject
      .mockResolvedValueOnce(needs)
      .mockImplementationOnce(answer(EMPTY))
      .mockImplementationOnce(answer(GOOD));
    const result = await draftSharepic('Sharepic: Mehr Busse für alle', 'de-DE');
    expect(result.spec.slides[0]!.items[0]).toMatchObject({ type: 'headline' });
    const [gemma, rescue] = draftCalls();
    expect(gemma!.pinned.model).toBe('gemma-4-31b:balanced');
    expect(rescue!.pinned).toEqual({ provider: 'mistral', model: 'mistral-large-4' });
    expect(rescue!.attempts).toBe(2);
  });

  it('is not retried when it succeeds', async () => {
    aiObject.mockResolvedValueOnce(needs).mockImplementationOnce(answer(GOOD));
    await draftSharepic('Sharepic: Mehr Busse für alle', 'de-DE');
    expect(draftCalls()).toHaveLength(1);
  });
});

describe('a draft that fails for good', () => {
  const failure = async () => {
    const err = await draftSharepic('Sharepic: Mehr Busse für alle', 'de-DE').catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(DraftFailedError);
    return err as DraftFailedError;
  };

  it('says the model failed, not the request', async () => {
    aiObject.mockResolvedValueOnce(needs).mockImplementation(answer(EMPTY));
    const err = await failure();
    expect(err.failure).toEqual({ kind: 'structure' });
    const { error } = draftFailedBody(err);
    expect(error).toContain('an deinem Auftrag lag das nicht');
    expect(error).not.toContain('Formuliere');
  });

  it('says the service was unreachable', async () => {
    aiObject
      .mockResolvedValueOnce(needs)
      .mockResolvedValue({ ok: false, error: 'timeout', cause: new Error('timeout') });
    const err = await failure();
    expect(err.failure).toEqual({ kind: 'provider' });
    expect(draftFailedBody(err).error).toContain('Der KI-Dienst war gerade nicht erreichbar.');
    // The lane's fallback chain already tried the rescue model.
    expect(draftCalls()).toHaveLength(1);
  });

  it('names the form it could not build', async () => {
    aiObject
      .mockResolvedValueOnce({ ...needs, data: { ...needs.data, form: 'zitat' } })
      .mockImplementation(answer(GOOD));
    const err = await failure();
    expect(err.failure).toEqual({ kind: 'form', form: 'zitat' });
    expect(draftFailedBody(err).error).toContain('Als Zitat ließ sich der Auftrag nicht umsetzen.');
  });

  it('asks for a clearer request when the content broke a rule', async () => {
    aiObject.mockResolvedValueOnce(needs).mockImplementation(answer(BROKEN));
    const err = await failure();
    expect(err.failure).toEqual({ kind: 'content' });
    expect(draftFailedBody(err).error).toContain('Formuliere den Auftrag etwas genauer');
  });

  it('keeps a checked draft’s failure over a later empty answer', async () => {
    aiObject
      .mockResolvedValueOnce(needs)
      .mockImplementationOnce(answer(BROKEN))
      .mockImplementationOnce(answer(EMPTY));
    expect((await failure()).failure).toEqual({ kind: 'content' });
  });

  it('counts an answer without any draft as the model’s failure', async () => {
    aiObject.mockResolvedValueOnce(needs).mockResolvedValue({ ok: false, error: 'kein JSON' });
    expect((await failure()).failure).toEqual({ kind: 'structure' });
  });
});

describe('lacksStructure', () => {
  it('tells an empty answer from one with wrong content', () => {
    expect(lacksStructure(EMPTY)).toBe(true);
    expect(lacksStructure({ slides: [] })).toBe(true);
    expect(lacksStructure(null)).toBe(true);
    expect(lacksStructure(GOOD)).toBe(false);
  });
});
