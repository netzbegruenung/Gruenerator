import { type SharepicSpec, SHAREPIC_NEUTRAL_PHOTO_ANALYSIS } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';
import { cutOutBilder } from './draftPainting.js';
import { berichtSaetze } from '@gruenerator/shared/image-studio';
import { OWN_PHOTO_KEPT_HINWEIS } from './ownPhoto.js';

type Slide = SharepicSpec['slides'][number];
const slide = (background: Slide['background']): Slide => ({
  background,
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: ['Radweg', 'jetzt'] }],
  logo: false,
});
const PHOTO: Slide['background'] = { kind: 'foto', filename: 'upload:1', textSeite: 'unten' };
const TANNE: Slide['background'] = { kind: 'farbe', color: 'tanne' };
const current: SharepicSpec = { locale: 'de-DE', slides: [slide(PHOTO)] };
const needs = { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [] };
const withoutLocale = (spec: SharepicSpec) => ({ slides: spec.slides });

type Validate = (
  input: unknown,
  attempt: number,
  attempts: number
) => { ok: true; value: unknown } | { ok: false; error: string };

/** Plays aiObject's repair loop: each answer goes through `validate`, the first accepted one wins. */
function answers(...drafts: SharepicSpec[]): { errors: string[] } {
  const errors: string[] = [];
  aiObject.mockReset();
  aiObject
    .mockResolvedValueOnce({ ok: true, data: needs })
    .mockImplementationOnce(async (call: { validate: Validate; attempts: number }) => {
      expect(call.attempts).toBe(drafts.length);
      for (const [i, draft] of drafts.entries()) {
        const checked = call.validate(withoutLocale(draft), i + 1, drafts.length);
        if (checked.ok) return { ok: true, data: checked.value };
        errors.push(checked.error);
      }
      return { ok: false, error: errors.at(-1) };
    });
  return { errors };
}

const COLOUR = 'Ändere die Hintergrundfarbe auf Tanne';
const lost: SharepicSpec = { locale: 'de-DE', slides: [slide(TANNE)] };
const panel: SharepicSpec = {
  locale: 'de-DE',
  slides: [slide({ kind: 'foto-oben', filename: 'upload:1', panelColor: 'tanne' })],
};

describe('draftSharepic — the own photo stays on a revision', () => {
  it('rejects a colour edit that drops the own photo and takes the repair', async () => {
    const run = answers(lost, panel, panel);
    const { spec, hinweis } = await draftSharepic(COLOUR, 'de-DE', current);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain('upload:1');
    expect(spec.slides[0]!.background).toEqual(panel.slides[0]!.background);
    expect(hinweis).toBeUndefined();
  });

  it('accepts dropping the photo when the instruction names it', async () => {
    const run = answers(lost, lost, lost);
    const { spec } = await draftSharepic('Ersetze das Foto durch eine Fläche', 'de-DE', current);
    expect(run.errors).toEqual([]);
    expect(spec.slides[0]!.background).toEqual(TANNE);
  });

  it('restores the photo with a notice when every attempt drops it', async () => {
    const run = answers(lost, lost, lost);
    const { spec, hinweis } = await draftSharepic(COLOUR, 'de-DE', current);
    expect(run.errors).toHaveLength(3);
    expect(spec.slides[0]!.background).toEqual(PHOTO);
    expect(hinweis).toBe(OWN_PHOTO_KEPT_HINWEIS);
  });

  const carousel: SharepicSpec = {
    locale: 'de-DE',
    slides: [slide(PHOTO), { ...slide(TANNE), items: [{ type: 'headline', lines: ['Zweite'] }] }],
  };

  it('accepts swapping slides without a photo word', async () => {
    const swapped = { ...carousel, slides: [carousel.slides[1]!, carousel.slides[0]!] };
    const run = answers(swapped, swapped, swapped);
    const { spec, hinweis } = await draftSharepic('Tausche Folie 1 und 2', 'de-DE', carousel);
    expect(run.errors).toEqual([]);
    expect(spec.slides.map((s) => s.background)).toEqual([TANNE, PHOTO]);
    expect(hinweis).toBeUndefined();
  });

  it('accepts deleting the slide that carries the photo', async () => {
    const rest = { ...carousel, slides: [carousel.slides[1]!] };
    const run = answers(rest, rest, rest);
    const { spec, hinweis } = await draftSharepic('Lösch die erste Folie', 'de-DE', carousel);
    expect(run.errors).toEqual([]);
    expect(spec.slides).toHaveLength(1);
    // Accepted without a repair turn, but the photo never leaves unsaid.
    expect(hinweis).toBe(
      'Dein eigenes Foto von Folie 1 ist dabei weggefallen – „Verwerfen“ holt es zurück.'
    );
  });

  it('accepts a bare confirmation when the instruction names the photo', async () => {
    const run = answers(lost, lost, lost);
    const instruction = 'Das Foto durch eine Fläche in Tanne ersetzen.';
    const { spec } = await draftSharepic(
      `ja, mach das\n\nNotizen aus dem Gespräch:\n${instruction}`,
      'de-DE',
      current,
      [],
      {},
      null,
      'ja, mach das',
      null,
      instruction
    );
    expect(run.errors).toEqual([]);
    expect(spec.slides[0]!.background).toEqual(TANNE);
  });

  it('keeps guarding a request of its own whose paraphrase mentions the photo', async () => {
    const run = answers(lost, lost, lost);
    const { spec } = await draftSharepic(
      COLOUR,
      'de-DE',
      current,
      [],
      {},
      null,
      COLOUR,
      null,
      'Hintergrundfarbe auf Tanne statt des Fotos'
    );
    expect(run.errors).toHaveLength(3);
    expect(spec.slides[0]!.background).toEqual(PHOTO);
  });

  it('keeps guarding when only the researched sources say „Bild“', async () => {
    const run = answers(lost, lost, lost);
    const { spec, hinweis } = await draftSharepic(
      `${COLOUR}\n\nRecherchierte Quellen dazu:\nDas Bild der Stadt wandelt sich: neue Radwege.`,
      'de-DE',
      current,
      [],
      {},
      null,
      COLOUR,
      null,
      COLOUR
    );
    expect(run.errors).toHaveLength(3);
    expect(spec.slides[0]!.background).toEqual(PHOTO);
    expect(hinweis).toBe(OWN_PHOTO_KEPT_HINWEIS);
  });

  it('tells the draft call that own photos stay', async () => {
    answers(panel, panel, panel);
    await draftSharepic(COLOUR, 'de-DE', current);
    const prompt = (aiObject.mock.calls[1]![0] as { prompt: string }).prompt;
    expect(prompt).toContain('Eigene Fotos der Person (upload:N) bleiben');
  });
});

describe('draftSharepic — the own photo is cut out', () => {
  const cutSlide = (): Slide => ({
    background: { kind: 'farbe', color: 'tanne' },
    position: 'oben',
    align: 'links',
    items: [
      { type: 'headline', lines: ['Radweg', 'jetzt'] },
      { type: 'bild', quelle: 'upload:1', ausschnitt: 'freigestellt', filter: 'original' },
    ],
    logo: false,
  });
  const cutDraft: SharepicSpec = { locale: 'de-DE', slides: [cutSlide()] };
  const photo = (url?: string) => ({
    id: 'upload:1',
    analysis: SHAREPIC_NEUTRAL_PHOTO_ANALYSIS,
    ...(url && { url }),
  });
  const URL = '/api/share/own-token-00000000001/download';
  const bildOf = (spec: SharepicSpec) => spec.slides[0]!.items.find((i) => i.type === 'bild')!;

  it('cuts the photo out when it came with a url, and reports it', async () => {
    const run = answers(cutDraft, cutDraft, cutDraft);
    const cutOut = vi.fn(async () => 'ki:freisteller-000000001');
    const draft = await draftSharepic('Radweg', 'de-DE', null, [photo(URL)], { cutOut });
    expect(run.errors).toEqual([]);
    expect(bildOf(draft.spec)).toMatchObject({ freisteller: 'ki:freisteller-000000001' });
    expect(draft.bericht).toContainEqual({ art: 'foto', id: 'upload:1', status: 'freigestellt' });
  });

  it('keeps the photo uncut and reports why when the cut-out fails', async () => {
    answers(cutDraft, cutDraft, cutDraft);
    const draft = await draftSharepic('Radweg', 'de-DE', null, [photo(URL)], {
      cutOut: async () => null,
    });
    expect(bildOf(draft.spec)).not.toHaveProperty('freisteller');
    expect(draft.hinweis).toContain('freistellen');
    expect(draft.bericht).toContainEqual(
      expect.objectContaining({ art: 'foto', id: 'upload:1', status: 'ungeschnitten' })
    );
  });

  it('reports an uncut own photo even without a painter', async () => {
    const { fotoEintraege } = await cutOutBilder(cutDraft, undefined, new Map(), [photo(URL)]);
    expect(fotoEintraege).toEqual([
      expect.objectContaining({ art: 'foto', id: 'upload:1', status: 'ungeschnitten' }),
    ]);
  });

  it('lists the foto entries before the others', async () => {
    answers(cutDraft, cutDraft, cutDraft);
    const draft = await draftSharepic('Radweg', 'de-DE', null, [photo(URL)], {
      cutOut: async () => 'ki:freisteller-000000001',
    });
    expect(draft.bericht?.[0]).toMatchObject({ art: 'foto' });
  });

  it('still refuses a cut-out for a photo without a url', async () => {
    const run = answers(cutDraft, cutDraft, cutDraft);
    await draftSharepic('Radweg', 'de-DE', null, [photo()], { cutOut: async () => 'ki:x' }).catch(
      () => null
    );
    expect(run.errors[0]).toContain('stellt der Grünerator nicht frei');
  });

  it('leaves the stock photo without an entry', async () => {
    const stock: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        {
          ...cutSlide(),
          items: [
            { type: 'headline', lines: ['Radweg', 'jetzt'] },
            {
              type: 'bild',
              quelle: 'diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg',
              ausschnitt: 'freigestellt',
              filter: 'original',
            },
          ],
        },
      ],
    };
    answers(stock, stock, stock);
    const draft = await draftSharepic('Radweg', 'de-DE', null, [], {
      cutOut: async () => 'ki:freisteller-000000001',
    });
    expect((draft.bericht ?? []).filter((e) => e.art === 'foto')).toEqual([]);
  });
});

describe('draftSharepic — no own photo vanishes unreported', () => {
  const slide2 = (bg: Slide['background']): SharepicSpec => ({
    locale: 'de-DE',
    slides: [slide(bg)],
  });
  const own = (id = 'upload:1') => ({ id, analysis: SHAREPIC_NEUTRAL_PHOTO_ANALYSIS });
  const fotos = (bericht: readonly { art: string; id?: string }[] | undefined) =>
    (bericht ?? []).filter((e) => e.art === 'foto');

  it('makes the photo the ground of a first draft that left it out', async () => {
    answers(lost, lost, lost);
    const draft = await draftSharepic('Radweg', 'de-DE', null, [own()]);
    expect(draft.spec.slides[0]!.background).toMatchObject({
      kind: 'foto',
      filename: 'upload:1',
      textSeite: 'unten',
    });
    expect(fotos(draft.bericht)).toEqual([
      {
        art: 'foto',
        id: 'upload:1',
        status: 'verwendet',
        grund: 'Ich habe dein Foto als Hintergrund eingesetzt.',
      },
    ]);
  });

  it('sends a first draft back that uses none of the photos brought along', async () => {
    const run = answers(lost, slide2(PHOTO), slide2(PHOTO));
    const draft = await draftSharepic('Radweg', 'de-DE', null, [own()]);
    expect(run.errors).toEqual([
      'Du hast ein eigenes Foto mitgebracht (upload:1) – setz es ein: als Hintergrund, als bild (auch ausschnitt "freigestellt") oder als "person" in der szene.',
    ]);
    expect(draft.spec.slides[0]!.background).toMatchObject({ filename: 'upload:1' });
    expect(
      fotos(draft.bericht).some((e) => (e as { status?: string }).status === 'nicht_verwendet')
    ).toBe(false);
  });

  it('lets the last attempt pass and reports the unused photo', async () => {
    const run = answers(lost, lost, lost);
    const draft = await draftSharepic('Radweg', 'de-DE', null, [own()]);
    expect(run.errors).toHaveLength(2);
    // the net places the photo as ground when the draft left it out
    expect(fotos(draft.bericht)).toHaveLength(1);
  });

  it('never sends a revision back for an unused photo', async () => {
    const run = answers(lost, lost, lost);
    await draftSharepic(
      'Mach den Hintergrund tanne',
      'de-DE',
      { locale: 'de-DE', slides: [slide(TANNE)] },
      [own()]
    );
    expect(run.errors).toEqual([]);
  });

  it('reports an unused photo of a revision, and nothing for one that is not offered', async () => {
    answers(lost, lost, lost);
    const kept = await draftSharepic('Mach den Hintergrund tanne', 'de-DE', {
      locale: 'de-DE',
      slides: [slide(TANNE)],
    });
    expect(fotos(kept.bericht)).toEqual([]);

    answers(lost, lost, lost);
    const draft = await draftSharepic(
      'Mach den Hintergrund tanne',
      'de-DE',
      { locale: 'de-DE', slides: [slide(TANNE)] },
      [own()]
    );
    expect(fotos(draft.bericht)).toEqual([
      {
        art: 'foto',
        id: 'upload:1',
        status: 'nicht_verwendet',
        grund: 'Es passte nicht in diesen Entwurf – sag mir, wo es hin soll.',
      },
    ]);
    expect(berichtSaetze(draft.bericht!).join(' ')).toContain('sag mir, wo es hin soll');
  });
});
