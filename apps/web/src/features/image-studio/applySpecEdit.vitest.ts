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
  matchSlides,
  reviewPatchForEdit,
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

const sentOf = (pages: SpecEditPage[]) => {
  const ctx = specEditContext(pages, pages[0]!.id, [])!;
  return { spec: ctx.sharepic.deckSpec, pageIds: ctx.pageIds };
};

async function edit(
  pages: SpecEditPage[],
  next: SharepicSpec,
  over: Partial<SpecEditDeps> = {},
  sent = sentOf(pages)
) {
  const d = deps(pages, over);
  const result = await applySpecEdit({
    deck: deckOf(pages),
    sent,
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

  it('sends only composer ids of the selection, at most 50', async () => {
    const pages = await mintedPages();
    const many = Array.from({ length: 60 }, (_, i) => `sc-${i}`);
    const ctx = specEditContext(pages, 'seed-1', [
      'own-sticker',
      'sc-0-headline',
      'chart-sc-1-zahl',
      ...many,
    ]);
    expect(ctx!.sharepic.selection.slice(0, 2)).toEqual(['sc-0-headline', 'chart-sc-1-zahl']);
    expect(ctx!.sharepic.selection).not.toContain('own-sticker');
    expect(ctx!.sharepic.selection).toHaveLength(50);
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
    const sent = sentOf(pages);
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
      'Deine Textänderung an Text „Alle zehn Minuten.“ während der Überarbeitung wurde überschrieben.'
    );
  });

  it('lifts again when the person edits while the deck is recomposed', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    // Typed after sending, where the model left the field: the deck is recomposed.
    bodyOf(pages[0]!.state).text = 'Jede Schule wird saniert.';
    let calls = 0;
    const d = deps(pages, {
      compose: async (spec, attributions, photoSrc) => {
        const out = await composeCreatorSharepic(spec, attributions, photoSrc);
        // The second compose is the recompose; the person moves a headline meanwhile.
        if (++calls === 2) headlineOf(pages[1]!.state).x += 40;
        return out;
      },
    });
    const movedTo = headlineOf(pages[1]!.state).x + 40;
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sent,
      sharepic: { spec: SPEC, attributions: [null, null, null] },
      brief: '',
      deps: d,
    });
    expect(result.status).toBe('applied');
    const ops = vi.mocked(d.replaceDeck).mock.calls[0]![0];
    expect(flat(bodyOf(ops.updates[0]!.state).text)).toBe('Jede Schule wird saniert.');
    expect(headlineOf(ops.updates[1]!.state).x).toBe(movedTo);
  });

  it('keeps a list point typed during the revision where the model left the list', async () => {
    const LISTE: SharepicSpec['slides'][number] = {
      ...S1,
      items: [
        { type: 'headline', lines: ['Klimaschutz jetzt'] },
        { type: 'liste', items: ['Schulen sanieren', 'Busse ausbauen'] },
      ],
    };
    const spec = deckWith(LISTE, S2);
    const pages = await mintedPages(spec);
    const sent = sentOf(pages);
    const list = texts(pages[0]!.state).find((t) => t.id === 'sc-1-liste')!;
    list.text = list.text.replace('Busse ausbauen', 'Radwege bauen');
    const next = deckWith(
      { ...LISTE, items: [{ type: 'headline', lines: ['Klimaschutz sofort'] }, LISTE.items[1]!] },
      S2
    );
    const d = deps(pages);
    await applySpecEdit({
      deck: deckOf(pages),
      sent,
      sharepic: { spec: next, attributions: [null, null] },
      brief: '',
      deps: d,
    });
    const ops = vi.mocked(d.replaceDeck).mock.calls[0]![0];
    expect(texts(ops.updates[0]!.state).find((t) => t.id === 'sc-1-liste')!.text).toContain(
      'Radwege bauen'
    );
  });

  const LISTE: SharepicSpec['slides'][number] = {
    ...S1,
    items: [
      { type: 'headline', lines: ['Klimaschutz jetzt'] },
      { type: 'liste', items: ['Schulen sanieren', 'Busse ausbauen'] },
    ],
  };

  it('keeps a list point added during the revision where the model left the list', async () => {
    const pages = await mintedPages(deckWith(LISTE, S2));
    const sent = sentOf(pages);
    texts(pages[0]!.state).find((t) => t.id === 'sc-1-liste')!.text += '\n• Radwege bauen';
    const next = deckWith(
      { ...LISTE, items: [{ type: 'headline', lines: ['Klimaschutz sofort'] }, LISTE.items[1]!] },
      S2
    );
    const { result, ops } = await edit(pages, next, {}, sent);
    const source = readSharepicSource({ configId: 'freeform', state: ops!.updates[0]!.state })!;
    expect(source.slide.slides[0]!.items[1]).toEqual({
      type: 'liste',
      items: ['Schulen sanieren', 'Busse ausbauen', 'Radwege bauen'],
    });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
  });

  it('reports a list point added during the revision where the model changed the list', async () => {
    const pages = await mintedPages(deckWith(LISTE, S2));
    const sent = sentOf(pages);
    texts(pages[0]!.state).find((t) => t.id === 'sc-1-liste')!.text += '\n• Radwege bauen';
    const next = deckWith(
      { ...LISTE, items: [LISTE.items[0]!, { type: 'liste', items: ['Schulen sanieren'] }] },
      S2
    );
    const { result } = await edit(pages, next, {}, sent);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Textänderung an Liste „Radwege bauen“ während der Überarbeitung wurde überschrieben.'
    );
  });

  it('reports a hand edit made during the last recompose', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    bodyOf(pages[0]!.state).text = 'Jede Schule wird saniert.';
    let calls = 0;
    const { result, ops } = await edit(
      pages,
      SPEC,
      {
        compose: async (spec, attributions, photoSrc) => {
          const out = await composeCreatorSharepic(spec, attributions, photoSrc);
          // Every recompose sees a new hand move on page 2.
          if (++calls > 1) headlineOf(pages[1]!.state).x += 10;
          return out;
        },
      },
      sent
    );
    expect(ops!.updates).toHaveLength(3);
    expect(result).toMatchObject({ status: 'applied', lateEditsLost: [2] });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Eine Handänderung auf Folie 2 kam während der Überarbeitung und wurde nicht übernommen – „Verwerfen“ holt sie zurück.'
    );
  });

  it('adopts a hand edit made during the last recompose when nothing needs composing', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    const original = bodyOf(pages[0]!.state).text;
    bodyOf(pages[0]!.state).text = 'Jede Schule wird saniert.';
    let calls = 0;
    const { result, ops } = await edit(
      pages,
      SPEC,
      {
        compose: async (spec, attributions, photoSrc) => {
          const out = await composeCreatorSharepic(spec, attributions, photoSrc);
          if (++calls > 1) headlineOf(pages[1]!.state).x += 10;
          // The last one also takes the late text back: nothing left to compose.
          if (calls === 4) bodyOf(pages[0]!.state).text = original;
          return out;
        },
      },
      sent
    );
    expect(calls).toBe(4);
    expect(result).toMatchObject({ status: 'applied', lateEditsLost: [] });
    expect(headlineOf(ops!.updates[1]!.state).x).toBe(headlineOf(pages[1]!.state).x);
    expect(flat(bodyOf(ops!.updates[0]!.state).text)).toBe(flat(original));
  });

  it('keeps a hand size on a retyped headline when the model changed something else', async () => {
    const pages = await mintedPages();
    const headline = headlineOf(pages[0]!.state) as Text & { fontSize: number };
    headline.text = 'Klimaschutz in der Stadt';
    headline.fontSize += 7;
    const sent = sentOf(pages);
    const next = structuredClone(sent.spec);
    next.slides[0]!.items[1] = { type: 'text', text: 'Jede Schule bis 2030.' };
    const { result, ops } = await edit(pages, next, {}, sent);
    const updated = headlineOf(ops!.updates[0]!.state) as Text & { fontSize: number };
    expect(flat(updated.text)).toBe('Klimaschutz in der Stadt');
    expect(updated.fontSize).toBe(headline.fontSize);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
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

  it('lets a requested size change win over a hand size, and reports it', async () => {
    const pages = await mintedPages();
    const headline = headlineOf(pages[0]!.state) as Text & { fontSize: number };
    headline.fontSize += 7;
    const longer = slide(
      'Klimaschutz jetzt in jeder Stadt und jedem Dorf',
      'Wir sanieren jede Schule bis 2030.'
    );
    const { result, ops } = await edit(pages, deckWith(longer, S2, S3));
    const updated = headlineOf(ops!.updates[0]!.state) as Text & { fontSize: number };
    expect(updated.fontSize).not.toBe(headline.fontSize);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Änderung an Überschrift ließ sich nicht übernehmen.'
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

  it('rebuilds a page that now shows a different slide and reports its hand edits', async () => {
    const pages = await mintedPages();
    headlineOf(pages[1]!.state).x += 30;
    (pages[1]!.state.shapeInstances as unknown[]).push({ id: 'meine-form', type: 'rect' });
    const { result, ops } = await edit(pages, deckWith(S1, NEW, S3));
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(ops!.inserts).toEqual([]);
    expect(ops!.removes).toEqual([]);
    const second = ops!.updates[1]!.state;
    expect(flat(headlineOf(second).text)).toBe('Mehr Grün');
    expect(second.shapeInstances).not.toContainEqual({ id: 'meine-form', type: 'rect' });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Folie 2 neu geschrieben – deine Änderungen darauf wurden verworfen.'
    );
  });

  it('gives a rewritten page with a late hand text one line', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    headlineOf(pages[1]!.state).x += 30;
    bodyOf(pages[1]!.state).text = 'Alle zehn Minuten.';
    const { result } = await edit(pages, deckWith(S1, NEW, S3), {}, sent);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Folie 2 neu geschrieben – deine Änderungen darauf wurden verworfen.'
    );
  });

  it('leaves a page added during the revision alone', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    const extra = { ...structuredClone(pages[1]!), id: 'extra' };
    bodyOf(extra.state).text = 'Von Hand dazu.';
    pages.splice(2, 0, extra);
    const { ops } = await edit(pages, deckWith(S1, S2, S3), {}, sent);
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(ops!.inserts).toEqual([]);
    expect(ops!.removes).toEqual([]);
  });

  it('keeps the deletion of a page removed during the revision', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    pages.splice(1, 1);
    const { ops } = await edit(pages, deckWith(S1, S2, S3), {}, sent);
    expect(ops!.updates.map((u) => u.pageId)).toEqual(['seed-0', 'seed-2']);
    expect(ops!.inserts).toEqual([]);
    expect(flat(headlineOf(ops!.updates[1]!.state).text)).toBe('Radwege bauen');
  });

  it('pairs by page id when the pages were reordered during the revision', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    const [p0, p1, p2] = pages;
    const reordered = [p1!, p0!, p2!];
    bodyOf(p0!.state).text = 'Jede Schule wird saniert.';
    const next = deckWith(S1, slide('Busse fahren öfter', 'Rund um die Uhr im Takt.'), S3);
    const { result, ops } = await edit(reordered, next, {}, sent);
    const byId = new Map(ops!.updates.map((u) => [u.pageId, u.state]));
    expect(flat(headlineOf(byId.get('seed-0')!).text)).toBe('Klimaschutz jetzt');
    expect(flat(bodyOf(byId.get('seed-0')!).text)).toBe('Jede Schule wird saniert.');
    expect(flat(bodyOf(byId.get('seed-1')!).text)).toBe('Rund um die Uhr im Takt.');
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
  });

  it('does not report a late hand text the model wrote the same way', async () => {
    const pages = await mintedPages();
    const sent = sentOf(pages);
    bodyOf(pages[0]!.state).text = 'Jede Schule wird saniert.';
    const next = deckWith(slide('Klimaschutz jetzt', 'Jede Schule wird saniert.'), S2, S3);
    const { result } = await edit(pages, next, {}, sent);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
  });

  it('reports a hand-typed headline the requested change replaced', async () => {
    const pages = await mintedPages();
    const headline = headlineOf(pages[0]!.state);
    headline.text = `${headline.text} (Hand)`;
    const sent = sentOf(pages);
    const next = deckWith(slide('Klimaschutz!', 'Wir sanieren jede Schule bis 2030.'), S2, S3);
    const { result, ops } = await edit(pages, next, {}, sent);
    expect(flat(headlineOf(ops!.updates[0]!.state).text)).toBe('Klimaschutz!');
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Textänderung an Überschrift „Klimaschutz jetzt (Hand)“ wurde durch die gewünschte Änderung ersetzt.'
    );
  });

  it('names the line under a figure by what it is, not as the figure', async () => {
    const zahl: SharepicSpec['slides'][number] = {
      background: { kind: 'farbe', color: 'mint' },
      position: 'mitte',
      align: 'zentriert',
      items: [
        { type: 'dachzeile', text: 'Mobilitätswende in Musterstadt' },
        { type: 'zahl', stil: 'stapel', wert: '500', label: 'neue Radwege bis 2028' },
      ],
      logo: false,
    };
    const spec: SharepicSpec = { locale: 'de-DE', slides: [zahl] };
    const pages = await mintedPages(spec);
    const label = texts(pages[0]!.state).find((t) => t.id === 'sc-1-zahl-label')!;
    label.text = `${label.text} (Hand)`;
    const sent = sentOf(pages);
    const next = structuredClone(spec);
    next.slides[0]!.items[1] = {
      type: 'zahl',
      stil: 'stapel',
      wert: '500',
      label: 'Radwege bis 2028',
    };
    const { result } = await edit(pages, next, {}, sent);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Deine Textänderung an Text zur Zahl „neue Radwege bis 2028 (Hand)“ wurde durch die gewünschte Änderung ersetzt.'
    );
  });

  it('shows the draft hinweis (an off-palette colour) first', async () => {
    const pages = await mintedPages();
    const d = deps(pages, {
      render: vi.fn(async () => ['bild']),
      review: vi.fn(async () => ({ ok: false, issues: ['Text zu klein'], patch: [] })),
    });
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sent: sentOf(pages),
      sharepic: {
        spec: SPEC,
        attributions: [null, null, null],
        hinweis: 'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen.',
      },
      brief: '',
      deps: d,
    });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen. Hinweise der Prüfung: Text zu klein'
    );
  });

  const PHOTO = { kind: 'foto', filename: 'upload:1', textSeite: 'unten' } as const;

  it('names the slide whose own photo the revision replaced', async () => {
    const pages = await mintedPages(deckWith(S1, { ...S2, background: PHOTO }, S3));
    const { result } = await edit(pages, SPEC);
    expect(result).toMatchObject({ status: 'applied', ownPhotoReplaced: [2] });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Dein eigenes Foto auf Folie 2 wurde ersetzt – „Verwerfen“ holt es zurück.'
    );
  });

  it('says it without a slide number on a single slide', async () => {
    const spec: SharepicSpec = { locale: 'de-DE', slides: [S1] };
    const pages = await mintedPages({ ...spec, slides: [{ ...S1, background: PHOTO }] });
    const { result } = await edit(pages, spec);
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Dein eigenes Foto wurde ersetzt – „Verwerfen“ holt es zurück.'
    );
  });

  it('drops the server note that the photo stays once it is gone after all', async () => {
    const pages = await mintedPages(deckWith(S1, { ...S2, background: PHOTO }, S3));
    const result = await applySpecEdit({
      deck: deckOf(pages),
      sent: sentOf(pages),
      sharepic: {
        spec: SPEC,
        attributions: [null, null, null],
        hinweis:
          'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen. Dein eigenes Foto bleibt – die Änderung ließ sich ohne das Foto nicht umsetzen.',
      },
      brief: '',
      deps: deps(pages),
    });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBe(
      'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen. Dein eigenes Foto auf Folie 2 wurde ersetzt – „Verwerfen“ holt es zurück.'
    );
  });

  it('stays quiet when the own photo is still there', async () => {
    const kept = deckWith({ ...S1, background: PHOTO }, S2, S3);
    const pages = await mintedPages(kept);
    const { result } = await edit(pages, kept);
    expect(result).toMatchObject({ ownPhotoReplaced: [] });
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
  });

  it('keeps a hand-typed headline the model left alone', async () => {
    const pages = await mintedPages();
    const headline = headlineOf(pages[0]!.state);
    headline.text = `${headline.text} (Hand)`;
    const sent = sentOf(pages);
    const next = structuredClone(sent.spec);
    next.slides[0]!.items[1] = { type: 'text', text: 'Jede Schule bis 2030.' };
    const { result, ops } = await edit(pages, next, {}, sent);
    expect(flat(headlineOf(ops!.updates[0]!.state).text)).toBe('Klimaschutz jetzt (Hand)');
    expect(describeSpecEdit(result as AppliedSpecEdit)).toBeNull();
  });

  it('applies nothing when a newer edit superseded this one', async () => {
    const pages = await mintedPages();
    const { result, d } = await edit(pages, SPEC, { isStale: () => true });
    expect(result).toEqual({ status: 'stale' });
    expect(d.replaceDeck).not.toHaveBeenCalled();
  });
});

describe('matchSlides', () => {
  it('tells photo slides with the same text apart by their photo', () => {
    const foto = (filename: string): SharepicSpec['slides'][number] => ({
      ...S1,
      background: { kind: 'foto', filename, textSeite: 'unten' },
    });
    expect(matchSlides([foto('a.jpg'), foto('b.jpg')], [foto('a.jpg')])).toEqual([
      { index: 0, filled: false },
    ]);
  });
});

describe('reviewPatchForEdit', () => {
  const sent = deckWith(
    { ...S1, items: [{ type: 'dachzeile', text: 'Mobilitätswende in Musterstadt' }, ...S1.items] },
    S2
  );
  const revised = structuredClone(sent);
  revised.slides[0]!.items[1] = { type: 'headline', lines: ['Klimaschutz!'] };

  it('keeps text ops only on items the edit changed, layout ops always', () => {
    const patch = reviewPatchForEdit(sent, revised, [
      { op: 'set_text', item: 0, text: 'Mobilitätswende Musterstadt' },
      { op: 'set_headline', lines: ['Klima!'] },
      { op: 'remove_item', item: 2 },
      { op: 'set_text', slide: 1, item: 1, text: 'Neu' },
      { op: 'set_position', position: 'oben' },
      { op: 'set_color', slide: 1, color: 'mint' },
    ]);
    expect(patch).toEqual([
      { op: 'set_headline', lines: ['Klima!'] },
      { op: 'set_position', position: 'oben' },
      { op: 'set_color', slide: 1, color: 'mint' },
    ]);
  });

  it('drops ops that would undo the requested change, and logs each', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const before = deckWith({
      ...S1,
      items: [{ type: 'headline', lines: ['Mobilität', 'für alle'] }],
    });
    const after = deckWith({
      ...S1,
      background: { kind: 'farbe', color: 'mint' },
      items: [{ type: 'headline', lines: ['Mobilität für alle'] }],
    });
    expect(
      reviewPatchForEdit(before, after, [
        { op: 'set_headline', lines: ['Mobilität', 'für alle'], akzent: 1 },
        { op: 'set_color', color: 'tanne' },
        { op: 'set_headline', lines: ['Mobilität', 'für', 'alle'] },
      ])
    ).toEqual([{ op: 'set_headline', lines: ['Mobilität', 'für', 'alle'] }]);
    expect(debug).toHaveBeenCalledTimes(2);
    debug.mockRestore();
  });

  it('drops a headline op that turns an untouched item into the headline', () => {
    expect(
      reviewPatchForEdit(sent, revised, [{ op: 'set_headline', item: 0, lines: ['500 Radwege'] }])
    ).toEqual([]);
  });

  it('lets text ops through on a slide the edit added', () => {
    const added = deckWith(...revised.slides, NEW);
    expect(
      reviewPatchForEdit(sent, added, [{ op: 'set_text', slide: 2, item: 1, text: 'Kürzer.' }])
    ).toHaveLength(1);
  });
});
