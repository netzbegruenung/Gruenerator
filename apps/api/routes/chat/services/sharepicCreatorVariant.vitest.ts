import {
  parseSharepicChatProps,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const draftSharepic = vi.fn();
vi.mock('../../../services/sharepicCreator/draftAgent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/sharepicCreator/draftAgent.js')>()),
  draftSharepic: (...a: unknown[]) => draftSharepic(...a),
}));

import {
  asksForAlternative,
  buildCreatorPrompt,
  createCreatorSharepic,
  reviseCreatorSharepic,
  toCreatorVariant,
} from './sharepicCreatorVariant.js';

const slide = (headline: string): SharepicSlide => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: [headline] }],
  logo: false,
});
const SPEC_DE: SharepicSpec = { locale: 'de-DE', slides: [slide('Busse ==statt== Stau')] };
const SPEC_AT: SharepicSpec = { locale: 'de-AT', slides: [slide('Öffis für alle')] };
const SPEC_CAROUSEL: SharepicSpec = {
  locale: 'de-DE',
  slides: [slide('A'), slide('B'), slide('C')],
};

beforeEach(() => draftSharepic.mockReset());

describe('toCreatorVariant', () => {
  it('builds one freeform variant carrying the spec', () => {
    const v = toCreatorVariant(
      { spec: SPEC_DE, chapters: [], attributions: [null] },
      { revisionOf: null, editorChangesDropped: false }
    );
    expect(v.canvasType).toBe('freeform');
    expect(v.initialProps).toEqual({ creatorSpec: SPEC_DE, attributions: [null] });
    expect(v.pages).toBeUndefined();
    expect(v.label).toBe('Sharepic');
  });

  it('derives the alt text from the first slide without marker syntax', () => {
    const v = toCreatorVariant(
      { spec: SPEC_DE, chapters: [], attributions: [null] },
      { revisionOf: null, editorChangesDropped: false }
    );
    expect(v.altText).toBe('Busse statt Stau');
  });

  it('uses freeform-at for Austria', () => {
    const v = toCreatorVariant(
      { spec: SPEC_AT, chapters: [], attributions: [null] },
      { revisionOf: null, editorChangesDropped: false }
    );
    expect(v.canvasType).toBe('freeform-at');
  });

  it('gives a carousel one page per slide', () => {
    const v = toCreatorVariant(
      { spec: SPEC_CAROUSEL, chapters: [], attributions: [null, null, null] },
      { revisionOf: null, editorChangesDropped: false }
    );
    expect(v.initialProps).toEqual({
      creatorSpec: SPEC_CAROUSEL,
      attributions: [null, null, null],
    });
    expect(v.pages?.map((p) => p.slide)).toEqual([0, 1, 2]);
    for (const page of v.pages ?? []) {
      expect(parseSharepicChatProps(page)?.creatorSpec).toEqual(SPEC_CAROUSEL);
    }
  });

  it('marks a revision', () => {
    const v = toCreatorVariant(
      { spec: SPEC_DE, chapters: [], attributions: [null] },
      { revisionOf: 'old-id', editorChangesDropped: true }
    );
    expect(v.initialProps).toMatchObject({ revisionOf: 'old-id', editorChangesDropped: true });
    expect(v.label).toBe('Überarbeitet');
  });
});

describe('asksForAlternative', () => {
  it.each([
    'mach mal eine andere Variante',
    'lieber eine ganz andere Gestaltung',
    'noch eine Version bitte',
    'gib mir einen neuen Entwurf',
  ])('detects %s', (t) => expect(asksForAlternative(t)).toBe(true));

  it.each([
    'Headline kürzer',
    'Foto raus, grüne Fläche',
    'Datum auf Freitag',
    'neuer Vorschlag für die Headline',
    'eine andere Gestaltung der Unterzeile',
  ])('ignores the edit %s', (t) => expect(asksForAlternative(t)).toBe(false));
});

describe('buildCreatorPrompt', () => {
  it('puts the brief first, then the background', () => {
    const p = buildCreatorPrompt({
      brief: 'Sharepic zu Bussen',
      background: 'Quelle: 30 % mehr Fahrgäste',
      avoid: null,
    });
    expect(p.indexOf('Sharepic zu Bussen')).toBe(0);
    expect(p).toContain('30 % mehr Fahrgäste');
  });

  it('describes the earlier layout to avoid it', () => {
    const p = buildCreatorPrompt({ brief: 'andere Variante', background: null, avoid: SPEC_DE });
    expect(p).toContain('deutlich anders');
    expect(p).toContain('farbe');
  });

  it('stays within the draft prompt limit', () => {
    const p = buildCreatorPrompt({ brief: 'x', background: 'y'.repeat(50_000), avoid: null });
    expect(p.length).toBeLessThanOrEqual(20_000);
  });
});

describe('createCreatorSharepic / reviseCreatorSharepic', () => {
  it('drafts fresh in the requested locale', async () => {
    draftSharepic.mockResolvedValue({ spec: SPEC_AT, chapters: [], attributions: [null] });
    const v = await createCreatorSharepic({
      brief: 'Öffis',
      background: null,
      avoid: null,
      locale: 'de-AT',
    });
    // The brief alone is the order: dates in the conversation material are not required.
    expect(draftSharepic).toHaveBeenCalledWith(
      expect.stringContaining('Öffis'),
      'de-AT',
      null,
      [],
      'Öffis'
    );
    expect(v.canvasType).toBe('freeform-at');
  });

  it('revises on top of the prior spec', async () => {
    draftSharepic.mockResolvedValue({ spec: SPEC_DE, chapters: [], attributions: [null] });
    const prior = { variantId: 'old', canvasType: 'freeform', props: {}, canvasId: null };
    const v = await reviseCreatorSharepic({ instruction: 'Headline kürzer', prior, spec: SPEC_DE });
    expect(draftSharepic).toHaveBeenCalledWith('Headline kürzer', 'de-DE', SPEC_DE, []);
    expect(v.initialProps).toMatchObject({ revisionOf: 'old' });
    expect(v.initialProps.editorChangesDropped).toBeUndefined();
  });

  it('flags editor changes when the prior was opened in the editor', async () => {
    draftSharepic.mockResolvedValue({ spec: SPEC_DE, chapters: [], attributions: [null] });
    const prior = { variantId: 'old', canvasType: 'freeform', props: {}, canvasId: 'c1' };
    const v = await reviseCreatorSharepic({ instruction: 'Headline kürzer', prior, spec: SPEC_DE });
    expect(v.initialProps).toMatchObject({ editorChangesDropped: true });
  });
});
