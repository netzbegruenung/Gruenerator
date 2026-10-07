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
  type AppliedSpecEdit,
  applySpecEdit,
  describeSpecEdit,
  specEditContext,
  type SpecEditDeps,
  type SpecEditPage,
} from './applySpecEdit';
import { canvasSeed, composeCreatorSharepic } from './freitext/composeForRender';

const slide = (headline: string, text: string): SharepicSpec['slides'][number] => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [
    { type: 'headline', lines: [headline] },
    { type: 'text', text },
  ],
  logo: false,
});

const S1 = slide('Klimaschutz jetzt', 'Wir sanieren jede Schule bis 2030.');
const S2 = slide('Busse fahren öfter', 'Im Takt von zehn Minuten, auch am Abend.');
const S3 = slide('Radwege bauen', 'Breit, sicher und durchgehend vernetzt.');
const NEW = slide('Mehr Grün', 'Hundert neue Bäume in jedem Viertel.');
const SPEC: SharepicSpec = { locale: 'de-DE', format: 'post-portrait-tall', slides: [S1, S2, S3] };
const deckWith = (...slides: SharepicSpec['slides']): SharepicSpec => ({ ...SPEC, slides });

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
const bodyOf = (state: Record<string, unknown>) => texts(state).find((t) => t.id === 'sc-1-text')!;
const flat = (text: string) => text.replace(/\s+/g, ' ');
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

async function edit(pages: SpecEditPage[], next: SharepicSpec, over: Partial<SpecEditDeps> = {}) {
  const d = deps(pages, over);
  const result = await applySpecEdit({
    deck: deckOf(pages),
    sent: specEditContext(pages, pages[0]!.id, [])!.sharepic.deckSpec,
    sharepic: { spec: next, attributions: next.slides.map(() => null) },
    brief: '',
    deps: d,
  });
  const ops = vi.mocked(d.replaceDeck).mock.calls[0]?.[0] ?? null;
  return { result, ops, d };
}

describe('specEditContext', () => {
  it('sends the lifted deck spec with hand texts, the focus slide and the selection', async () => {
    const pages = await mintedPages();
    bodyOf(pages[1]!.state).text = 'Für alle, jeden Tag.';
    const ctx = specEditContext(pages, 'seed-1', ['sc-0-headline']);
    expect(ctx).not.toBeNull();
    expect(ctx!.deck).toBe(deckOf(pages));
    expect(ctx!.sharepic.focusSlide).toBe(1);
    expect(ctx!.sharepic.selection).toEqual(['sc-0-headline']);
    expect(ctx!.sharepic.deckSpec.slides[1]!.items[1]).toEqual({
      type: 'text',
      text: 'Für alle, jeden Tag.',
    });
    expect(ctx!.sharepic.deckSpec.slides[0]).toEqual(S1);
  });

  it('is null for a page without a source — the op path takes over', async () => {
    const pages = await mintedPages();
    delete pages[0]!.state[SHAREPIC_SOURCE_KEY];
    expect(specEditContext(pages, 'seed-0', [])).toBeNull();
    expect(specEditContext(pages, null, [])).toBeNull();
  });

  it('falls back to the op path when lifting throws', async () => {
    const pages = await mintedPages();
    Object.defineProperty(pages[1]!.state, 'additionalTexts', {
      get: () => {
        throw new Error('broken page');
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(specEditContext(pages, 'seed-0', [])).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('applySpecEdit', () => {
  it('recomposes every deck page in one replaceDeck, keeping a hand move and a foreign element', async () => {
    const pages = await mintedPages();
    const moved = headlineOf(pages[0]!.state);
    moved.x += 40;
    const foreign = { id: 'meine-form', type: 'rect', x: 10, y: 10, fill: '#ff0000' };
    (pages[0]!.state.shapeInstances as unknown[]).push(foreign);
    const next = deckWith(
      slide('Klimaschutz sofort', 'Wir sanieren jede Schule bis 2030.'),
      S2,
      S3
    );

    const { result, ops } = await edit(pages, next);

    expect(result).toMatchObject({ status: 'applied', dropped: [], removedSlides: [] });
    expect(ops!.inserts).toEqual([]);
    expect(ops!.removes).toEqual([]);
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    const first = ops!.updates[0]!.state;
    expect(flat(headlineOf(first).text)).toBe('Klimaschutz sofort');
    expect(headlineOf(first).x).toBe(moved.x);
    expect(first.shapeInstances).toContainEqual(foreign);
    const source = readSharepicSource({ configId: pages[0]!.configId, state: first })!;
    expect(source.deck).toBe(deckOf(pages));
    expect(source.slide.slides).toEqual([next.slides[0]]);
    // The next lift sees the move again, not as a fresh baseline.
    expect(source.baseline.elements[moved.id]!.x).not.toBe(moved.x);
  });

  it('appends a slide after the last deck page', async () => {
    const pages = await mintedPages();
    const { ops } = await edit(pages, deckWith(S1, S2, S3, NEW));
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(ops!.inserts).toHaveLength(1);
    expect(ops!.inserts[0]).toMatchObject({
      afterPageId: 'seed-2',
      pageId: 'new-0',
      configId: pages[0]!.configId,
    });
    expect(flat(headlineOf(ops!.inserts[0]!.state).text)).toBe('Mehr Grün');
    expect(readSharepicSource(ops!.inserts[0]!)!.deck).toBe(deckOf(pages));
  });

  it('inserts a slide mid-deck behind its predecessor, the later pages keep their edits', async () => {
    const pages = await mintedPages();
    const moved = headlineOf(pages[1]!.state);
    moved.x += 30;
    const { ops } = await edit(pages, deckWith(S1, NEW, S2, S3));
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(ops!.inserts).toMatchObject([{ afterPageId: 'seed-0', pageId: 'new-0' }]);
    expect(flat(headlineOf(ops!.inserts[0]!.state).text)).toBe('Mehr Grün');
    const second = ops!.updates[1]!.state;
    expect(flat(headlineOf(second).text)).toBe('Busse fahren öfter');
    expect(headlineOf(second).x).toBe(moved.x);
  });

  it('removes the dropped first slide, reports its hand edits, and keeps the rest on their pages', async () => {
    const pages = await mintedPages();
    (pages[0]!.state.shapeInstances as unknown[]).push({ id: 'meine-form', type: 'rect' });
    const moved = headlineOf(pages[2]!.state);
    moved.x += 30;
    const { result, ops } = await edit(pages, deckWith(S2, S3));
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-1', 'seed-2']);
    expect(ops!.removes).toEqual(['seed-0']);
    expect(headlineOf(ops!.updates[1]!.state).x).toBe(moved.x);
    expect(result).toMatchObject({ status: 'applied', removedSlides: [1] });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Folie 1 entfernt – deine Änderungen darauf wurden verworfen.'
    );
  });

  it('inserts a new first slide where the deck starts', async () => {
    const pages = await mintedPages();
    const { ops } = await edit(pages, deckWith(NEW, S1, S2, S3));
    expect(ops!.inserts).toMatchObject([{ afterPageId: null, pageId: 'new-0' }]);
  });

  it('keeps a text typed during the revision where the model left it, reports it where both changed', async () => {
    const pages = await mintedPages();
    const sent = specEditContext(pages, 'seed-0', [])!.sharepic.deckSpec;
    // Typed after sending, while the model revised.
    bodyOf(pages[0]!.state).text = 'Jede Schule wird saniert.';
    bodyOf(pages[1]!.state).text = 'Alle zehn Minuten.';
    const next = deckWith(S1, slide('Busse fahren öfter', 'Rund um die Uhr im Takt.'), S3);
    const d = deps(pages);
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sent,
      sharepic: { spec: next, attributions: [null, null, null] },
      brief: '',
      deps: d,
    });
    const ops = vi.mocked(d.replaceDeck).mock.calls[0]![0];
    expect(flat(bodyOf(ops.updates[0]!.state).text)).toBe('Jede Schule wird saniert.');
    expect(
      readSharepicSource({ configId: 'freeform', state: ops.updates[0]!.state })!.slide.slides[0]!
        .items[1]
    ).toEqual({ type: 'text', text: 'Jede Schule wird saniert.' });
    expect(flat(bodyOf(ops.updates[1]!.state).text)).toBe('Rund um die Uhr im Takt.');
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Textänderung an Text während der Überarbeitung wurde überschrieben.'
    );
  });

  it('reports a hand move the new layout cannot keep, in German', async () => {
    const pages = await mintedPages();
    headlineOf(pages[0]!.state).x += 40;
    const { result } = await edit(pages, deckWith({ ...S1, position: 'unten' }, S2, S3));
    expect(result.status).toBe('applied');
    expect((result as AppliedSpecEdit).dropped).toHaveLength(1);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Verschiebung von Überschrift ließ sich nicht übernehmen.'
    );
  });

  it('reports a hand background the revised background replaces', async () => {
    const pages = await mintedPages();
    pages[0]!.state.backgroundColor = '#123456';
    const changed = { ...S1, background: { kind: 'farbe' as const, color: 'mint' as const } };
    const { result, ops } = await edit(pages, deckWith(changed, S2, S3));
    expect(ops!.updates[0]!.state.backgroundColor).not.toBe('#123456');
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Änderung am Hintergrund ließ sich nicht übernehmen.'
    );
  });

  it('shows the review hinweise', async () => {
    const pages = await mintedPages();
    const { result } = await edit(pages, SPEC, {
      render: vi.fn(async () => ['bild']),
      review: vi.fn(async () => ({ ok: false, issues: ['Text zu klein'], patch: [] })),
    });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe('Hinweise der Prüfung: Text zu klein');
  });

  it('applies nothing when a newer edit superseded this one', async () => {
    const pages = await mintedPages();
    const { result, d } = await edit(pages, SPEC, { isStale: () => true });
    expect(result).toEqual({ status: 'stale' });
    expect(d.replaceDeck).not.toHaveBeenCalled();
  });
});
