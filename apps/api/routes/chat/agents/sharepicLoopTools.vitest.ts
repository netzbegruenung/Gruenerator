import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftFailedError } from '../../../services/sharepicCreator/draftAgent.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const resolveTarget = vi.fn<(...a: unknown[]) => unknown>();
const reviseCreatorSharepic = vi.fn<(...a: unknown[]) => unknown>();
vi.mock('../services/sharepicLoopTarget.js', () => ({
  resolveLoopSharepicTarget: (...a: unknown[]) => resolveTarget(...a),
}));
vi.mock('../services/sharepicCreatorVariant.js', () => ({
  reviseCreatorSharepic: (...a: unknown[]) => reviseCreatorSharepic(...a),
}));

const { makeEditSharepicTool, makeReadSharepicTool, quotesSharepicText } =
  await import('./sharepicLoopTools.js');

const slide = (headline: string) => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: [headline] }],
  logo: false,
});
const SPEC = { locale: 'de-DE', slides: [slide('Busse ==statt== Stau')] };
const target = {
  prior: { variantId: 'v1', canvasType: 'freeform', props: {}, canvasId: null },
  props: { creatorSpec: SPEC },
};

type SseEvent = { type: string; payload: unknown };
function setup() {
  const events: SseEvent[] = [];
  const sse = { send: (type: string, payload: unknown) => events.push({ type, payload }) };
  const state = {
    agentConfig: { userId: 'u1' },
    currentSharepic: null,
  } as unknown as ChatGraphState;
  const ctx = { sse, state, threadId: 't1' } as never;
  const run = (t: unknown, input: unknown) =>
    (t as { execute: (i: unknown) => Promise<Record<string, unknown>> }).execute(input);
  return { events, ctx, run };
}

beforeEach(() => {
  resolveTarget.mockReset();
  reviseCreatorSharepic.mockReset();
});

describe('read_sharepic', () => {
  it('returns id, slide count and the compact texts', async () => {
    resolveTarget.mockResolvedValue(target);
    const { ctx, run } = setup();
    const out = await run(makeReadSharepicTool(ctx), {});
    expect(out).toMatchObject({ variantId: 'v1', slideCount: 1 });
    expect(out.beschreibung).toContain('Busse statt Stau');
    expect(out.beschreibung).toContain('color: tanne');
  });

  it('reports an error when there is no creator sharepic', async () => {
    resolveTarget.mockResolvedValue(null);
    const { ctx, run } = setup();
    expect(await run(makeReadSharepicTool(ctx), {})).toHaveProperty('error');
  });
});

describe('edit_sharepic', () => {
  it('emits sharepic_complete and returns the variants of a real change', async () => {
    resolveTarget.mockResolvedValue(target);
    const variant = {
      id: 'v2',
      canvasType: 'freeform',
      initialProps: { creatorSpec: { ...SPEC, slides: [slide('Neu')] }, revisionOf: 'v1' },
    };
    reviseCreatorSharepic.mockResolvedValue(variant);
    const { ctx, events, run } = setup();
    const out = await run(makeEditSharepicTool(ctx), { anweisung: 'Headline: Neu' });
    expect(out).toMatchObject({ variantId: 'v2', unchanged: false, variants: [variant] });
    expect(events.find((e) => e.type === 'sharepic_complete')?.payload).toMatchObject({
      variants: [variant],
    });
    expect(reviseCreatorSharepic.mock.calls[0]?.[0]).toMatchObject({
      instruction: 'Headline: Neu',
      userId: 'u1',
    });
  });

  it('answers unchanged as a failed step without a card', async () => {
    resolveTarget.mockResolvedValue(target);
    reviseCreatorSharepic.mockResolvedValue({
      id: 'v2',
      canvasType: 'freeform',
      initialProps: { creatorSpec: structuredClone(SPEC), revisionOf: 'v1' },
    });
    const { ctx, events, run } = setup();
    const out = await run(makeEditSharepicTool(ctx), { anweisung: 'mach es besser' });
    expect(out).toMatchObject({ unchanged: true });
    expect(out.error).toBeTruthy();
    expect(out.variants).toBeUndefined();
    expect(events.some((e) => e.type === 'sharepic_complete')).toBe(false);
  });

  it('refuses without a creator target (legacy template sharepic)', async () => {
    resolveTarget.mockResolvedValue(null);
    const { ctx, run } = setup();
    const out = await run(makeEditSharepicTool(ctx), { anweisung: 'x' });
    expect(String(out.error)).toContain('Studio');
    expect(reviseCreatorSharepic).not.toHaveBeenCalled();
  });

  it('allows at most two drafts per turn', async () => {
    resolveTarget.mockResolvedValue(target);
    reviseCreatorSharepic.mockResolvedValue({
      id: 'v2',
      canvasType: 'freeform',
      initialProps: { creatorSpec: { ...SPEC, slides: [slide('Neu')] } },
    });
    const { ctx, run } = setup();
    const t = makeEditSharepicTool(ctx);
    await run(t, { anweisung: 'a' });
    await run(t, { anweisung: 'b' });
    const third = await run(t, { anweisung: 'c' });
    expect(third.error).toBeTruthy();
    expect(reviseCreatorSharepic).toHaveBeenCalledTimes(2);
  });

  it('turns a failed draft into an error result', async () => {
    resolveTarget.mockResolvedValue(target);
    reviseCreatorSharepic.mockRejectedValue(new DraftFailedError('kaputt'));
    const { ctx, events, run } = setup();
    const out = await run(makeEditSharepicTool(ctx), { anweisung: 'x' });
    expect(String(out.error)).toContain('Überarbeitung ist nicht gelungen');
    expect(events.some((e) => e.type === 'sharepic_complete')).toBe(false);
  });
});

describe('quotesSharepicText', () => {
  it('erkennt einen zitierten Text, der auf dem Sharepic steht', () => {
    expect(quotesSharepicText('Ersetze „Busse" durch „Bahnen"', SPEC as never)).toBe(true);
    expect(quotesSharepicText('Ersetze "statt Stau" bitte', SPEC as never)).toBe(true);
  });

  it('ignoriert Zitate, die nicht auf dem Sharepic stehen', () => {
    expect(quotesSharepicText('Ersetze „Radwege" durch „Bahnen"', SPEC as never)).toBe(false);
    expect(quotesSharepicText('Mach die Busse größer', SPEC as never)).toBe(false);
  });
});
