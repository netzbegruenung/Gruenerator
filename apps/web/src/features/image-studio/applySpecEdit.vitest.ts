import { readSharepicSource } from '@gruenerator/canvas-editor/composer';
import { SHAREPIC_SOURCE_KEY, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gruenerator/canvas-editor/composer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gruenerator/canvas-editor/composer')>();
  return { ...actual, ensureFontsReady: vi.fn(async () => {}) };
});
vi.mock('./freitext/photoTone', () => ({
  primePhotoTones: vi.fn(async () => {}),
  cachedPhotoTone: vi.fn(() => null),
}));

import {
  applySpecEdit,
  describeDroppedOverrides,
  specEditContext,
  type SpecEditDeps,
  type SpecEditPage,
} from './applySpecEdit';
import { canvasSeed, composeCreatorSharepic } from './freitext/composeForRender';

const slide = (headline: string): SharepicSpec['slides'][number] => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [
    { type: 'headline', lines: [headline] },
    { type: 'text', text: 'Für eine Stadt, die allen gehört.' },
  ],
  logo: false,
});

const SPEC: SharepicSpec = {
  locale: 'de-DE',
  format: 'post-portrait-tall',
  slides: [slide('Klimaschutz jetzt'), slide('Busse fahren öfter'), slide('Radwege bauen')],
};

async function mintedPages(spec = SPEC): Promise<SpecEditPage[]> {
  const composed = await composeCreatorSharepic(
    spec,
    spec.slides.map(() => null)
  );
  const seed = canvasSeed(composed, {
    base: spec,
    tweaks: {},
    attributions: spec.slides.map(() => null),
  });
  return structuredClone(seed.initialState.pages) as SpecEditPage[];
}

type Text = { id: string; x: number; text: string };
const texts = (state: Record<string, unknown>) => state.additionalTexts as Text[];
const headlineOf = (state: Record<string, unknown>) =>
  texts(state).find((t) => t.id.startsWith('sc-0-headline'))!;
const deckOf = (pages: SpecEditPage[]) => readSharepicSource(pages[0]!)!.deck;

function deps(pages: SpecEditPage[], over: Partial<SpecEditDeps> = {}): SpecEditDeps {
  let n = 0;
  return {
    getPages: () => pages,
    compose: (spec, attributions, photoSrc) => composeCreatorSharepic(spec, attributions, photoSrc),
    // No previews: the review loop is skipped, the composed deck still applies.
    render: vi.fn(async () => null),
    review: vi.fn(async () => null),
    applyPatch: (spec) => spec,
    replaceDeck: vi.fn(() => []),
    isStale: () => false,
    newPageId: () => `new-${n++}`,
    ...over,
  };
}

describe('specEditContext', () => {
  it('sends the lifted deck spec with hand texts, the focus slide and the selection', async () => {
    const pages = await mintedPages();
    texts(pages[1]!.state).find((t) => t.id === 'sc-1-text')!.text = 'Für alle, jeden Tag.';
    const ctx = specEditContext(pages, 'seed-1', ['sc-0-headline']);
    expect(ctx).not.toBeNull();
    expect(ctx!.deck).toBe(deckOf(pages));
    expect(ctx!.sharepic.focusSlide).toBe(1);
    expect(ctx!.sharepic.selection).toEqual(['sc-0-headline']);
    expect(ctx!.sharepic.deckSpec.slides[1]!.items[1]).toEqual({
      type: 'text',
      text: 'Für alle, jeden Tag.',
    });
    expect(ctx!.sharepic.deckSpec.slides[0]).toEqual(SPEC.slides[0]);
  });

  it('is null for a page without a source — the op path takes over', async () => {
    const pages = await mintedPages();
    delete pages[0]!.state[SHAREPIC_SOURCE_KEY];
    expect(specEditContext(pages, 'seed-0', [])).toBeNull();
    expect(specEditContext(pages, null, [])).toBeNull();
  });
});

describe('applySpecEdit', () => {
  it('recomposes every deck page in one replaceDeck, keeping a hand move and a foreign element', async () => {
    const pages = await mintedPages();
    const moved = headlineOf(pages[0]!.state);
    moved.x += 40;
    const foreign = { id: 'meine-form', type: 'rect', x: 10, y: 10, fill: '#ff0000' };
    (pages[0]!.state.shapeInstances as unknown[]).push(foreign);
    const d = deps(pages);
    const next: SharepicSpec = {
      ...SPEC,
      slides: [slide('Klimaschutz sofort'), SPEC.slides[1]!, SPEC.slides[2]!],
    };

    const result = await applySpecEdit({
      deck: deckOf(pages),
      sharepic: { spec: next, attributions: [null, null, null] },
      brief: 'Mach die Überschrift dringlicher',
      deps: d,
    });

    expect(result).toEqual({ status: 'applied', dropped: [] });
    expect(d.replaceDeck).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(d.replaceDeck).mock.calls[0]![0];
    expect(ops.inserts).toEqual([]);
    expect(ops.removes).toEqual([]);
    expect(ops.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    const first = ops.updates[0]!.state;
    expect(headlineOf(first).text.replace(/\s+/g, ' ')).toBe('Klimaschutz sofort');
    expect(headlineOf(first).x).toBe(moved.x);
    expect(first.shapeInstances).toContainEqual(foreign);
    const source = readSharepicSource({ configId: pages[0]!.configId, state: first })!;
    expect(source.deck).toBe(deckOf(pages));
    expect(source.slide.slides).toEqual([next.slides[0]]);
    // The next lift sees the move again, not as a fresh baseline.
    expect(source.baseline.elements[moved.id]!.x).not.toBe(moved.x);
  });

  it('inserts an added slide after the last deck page and removes a dropped one', async () => {
    const pages = await mintedPages();
    const d = deps(pages);
    const four: SharepicSpec = { ...SPEC, slides: [...SPEC.slides, slide('Mehr Grün')] };
    await applySpecEdit({
      deck: deckOf(pages),
      sharepic: { spec: four, attributions: [null, null, null, null] },
      brief: '',
      deps: d,
    });
    const grow = vi.mocked(d.replaceDeck).mock.calls[0]![0];
    expect(grow.updates).toHaveLength(3);
    expect(grow.inserts).toHaveLength(1);
    expect(grow.inserts[0]).toMatchObject({
      afterPageId: 'seed-2',
      pageId: 'new-0',
      configId: pages[0]!.configId,
    });
    expect(headlineOf(grow.inserts[0]!.state).text.replace(/\s+/g, ' ')).toBe('Mehr Grün');
    expect(readSharepicSource(grow.inserts[0]!)!.deck).toBe(deckOf(pages));

    const d2 = deps(pages);
    const two: SharepicSpec = { ...SPEC, slides: SPEC.slides.slice(0, 2) };
    await applySpecEdit({
      deck: deckOf(pages),
      sharepic: { spec: two, attributions: [null, null] },
      brief: '',
      deps: d2,
    });
    const shrink = vi.mocked(d2.replaceDeck).mock.calls[0]![0];
    expect(shrink.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1']);
    expect(shrink.removes).toEqual(['seed-2']);
  });

  it('reports a hand move the new layout cannot keep', async () => {
    const pages = await mintedPages();
    headlineOf(pages[0]!.state).x += 40;
    const d = deps(pages);
    const next: SharepicSpec = {
      ...SPEC,
      slides: [{ ...SPEC.slides[0]!, position: 'unten' }, SPEC.slides[1]!, SPEC.slides[2]!],
    };
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sharepic: { spec: next, attributions: [null, null, null] },
      brief: '',
      deps: d,
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.dropped).toHaveLength(1);
    expect(describeDroppedOverrides(result.dropped)).toBe(
      'Deine Verschiebung von Headline ließ sich nicht übernehmen.'
    );
  });

  it('applies nothing when a newer edit superseded this one', async () => {
    const pages = await mintedPages();
    const d = deps(pages, { isStale: () => true });
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sharepic: { spec: SPEC, attributions: [null, null, null] },
      brief: '',
      deps: d,
    });
    expect(result).toEqual({ status: 'stale' });
    expect(d.replaceDeck).not.toHaveBeenCalled();
  });
});
