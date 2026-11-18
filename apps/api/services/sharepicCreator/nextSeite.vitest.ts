import { nextSeitePrompt, type SharepicSeite } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
const draftSharepic = vi.hoisted(() => vi.fn());
const listSharepicSeiten = vi.hoisted(() => vi.fn());

vi.mock('../ai/generate.js', () => ({ aiObject }));
vi.mock('./draftAgent.js', () => ({ draftSharepic, PINNED: { provider: 'melious', model: 'x' } }));
vi.mock('../sharepicVorlagen/catalog.js', () => ({ listSharepicSeiten }));

import { draftNextSeite, knownCandidates, NoFittingSeiteError } from './nextSeite.js';

const seite = (id: string, over: Partial<SharepicSeite> = {}) =>
  ({
    id,
    titel: id,
    rolle: 'inhalt',
    typ: 'text',
    formats: ['post-portrait'],
    locale: 'de-DE',
    attribution: null,
    slide: { background: { kind: 'farbe', color: 'tanne' }, items: [{ type: 'absatz', text: id }] },
    ...over,
  }) as unknown as SharepicSeite;

const CATALOGUE = [
  seite('liste', { typ: 'liste' }),
  seite('zitat', { typ: 'zitat', thema: 'europa' }),
  seite('hoch', { formats: ['post-portrait-tall'] }),
];

const DECK = 'Seite 1: Überschrift: Mehr Bus\nSeite 2: Weitere Texte: Takt / Preis';

const drafted = (slides: unknown[]) => ({
  spec: { locale: 'de-DE', format: 'post-portrait', slides },
  chapters: [],
  attributions: slides.map(() => null),
});

const request = (candidates: string[]) => ({
  candidates,
  deck: DECK,
  format: 'post-portrait' as const,
  locale: 'de-DE' as const,
  brand: 'gruene' as const,
  painters: {},
});

beforeEach(() => {
  aiObject.mockReset();
  draftSharepic.mockReset();
  listSharepicSeiten.mockReset().mockReturnValue(CATALOGUE);
  draftSharepic.mockResolvedValue(drafted([{ background: { kind: 'farbe', color: 'tanne' } }]));
});

describe('knownCandidates', () => {
  it('keeps the picker’s order and drops unknown, repeated and other-format ids', () => {
    const ids = knownCandidates(
      ['zitat', 'fremd', 'hoch', 'liste', 'zitat'],
      'post-portrait',
      'de-DE',
      'gruene'
    ).map((s) => s.id);
    expect(ids).toEqual(['zitat', 'liste']);
    expect(listSharepicSeiten).toHaveBeenCalledWith('de-DE', 'gruene');
  });
});

describe('draftNextSeite', () => {
  it('fails without a Seite of the format', async () => {
    await expect(draftNextSeite(request(['fremd', 'hoch']))).rejects.toBeInstanceOf(
      NoFittingSeiteError
    );
    expect(draftSharepic).not.toHaveBeenCalled();
  });

  it('writes a single candidate without asking which one', async () => {
    const result = await draftNextSeite(request(['liste']));
    expect(aiObject).not.toHaveBeenCalled();
    expect(result.seiteId).toBe('liste');
  });

  it('lets the creator pick among the candidates, from a closed list', async () => {
    aiObject.mockResolvedValue({ ok: true, data: { seite: 'zitat', grund: 'eine Stimme' } });
    const result = await draftNextSeite(request(['liste', 'zitat']));

    const call = aiObject.mock.calls[0]![0] as {
      pinned: unknown;
      prompt: string;
      validate: (input: unknown) => { ok: boolean };
    };
    expect(call.pinned).toEqual({ provider: 'melious', model: 'x' });
    expect(call.prompt).toContain(DECK);
    expect(call.prompt).toContain('zitat · zitat · Inhaltsseite, zitat');
    expect(call.validate({ seite: 'zitat', grund: 'x' }).ok).toBe(true);
    expect(call.validate({ seite: 'hoch', grund: 'x' }).ok).toBe(false);
    expect(result.seiteId).toBe('zitat');
  });

  it('takes the closest look when the pick fails', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'kaputt' });
    expect((await draftNextSeite(request(['liste', 'zitat']))).seiteId).toBe('liste');
  });

  it('revises the Seite’s one-slide spec with the design’s text', async () => {
    aiObject.mockResolvedValue({ ok: true, data: { seite: 'zitat', grund: '' } });
    await draftNextSeite(request(['liste', 'zitat']));
    expect(draftSharepic).toHaveBeenCalledWith(
      nextSeitePrompt(DECK),
      'de-DE',
      {
        locale: 'de-DE',
        format: 'post-portrait',
        thema: 'europa',
        slides: [CATALOGUE[1]!.slide],
      },
      [],
      {}
    );
  });

  it('keeps one page when the draft grew more', async () => {
    draftSharepic.mockResolvedValue(drafted([{ n: 1 }, { n: 2 }]));
    const result = await draftNextSeite(request(['liste']));
    expect(result.spec.slides).toEqual([{ n: 1 }]);
    expect(result.attributions).toEqual([null]);
  });
});
