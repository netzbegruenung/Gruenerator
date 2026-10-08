import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';
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
