import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';

const slide: SharepicSpec['slides'][number] = {
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: ['Klimaschutz', 'vor Ort'] }],
  logo: false,
};
const needs = { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [] };

describe('draftSharepic — format on a revision', () => {
  it('keeps the draft format when the model leaves it out', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: needs }).mockResolvedValueOnce({
      ok: true,
      data: { spec: { locale: 'de-DE', slides: [slide] }, scene: null },
    });
    const current: SharepicSpec = {
      locale: 'de-DE',
      format: 'post-portrait-tall',
      slides: [slide],
    };

    const { spec } = await draftSharepic('Mach die Headline kürzer', 'de-DE', current);

    expect(spec.format).toBe('post-portrait-tall');
  });

  it('takes the format the model names', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: needs }).mockResolvedValueOnce({
      ok: true,
      data: { spec: { locale: 'de-DE', format: 'post-portrait', slides: [slide] }, scene: null },
    });
    const current: SharepicSpec = {
      locale: 'de-DE',
      format: 'post-portrait-tall',
      slides: [slide],
    };

    const { spec } = await draftSharepic('Bitte wieder 4:5', 'de-DE', current);

    expect(spec.format).toBe('post-portrait');
  });
});

describe('draftSharepic — focus on a revision', () => {
  const current: SharepicSpec = { locale: 'de-DE', slides: [slide, slide, slide] };
  const promptsOf = (): string[] =>
    aiObject.mock.calls.map((c) => (c[0] as { prompt: string }).prompt);

  function answer(): void {
    aiObject.mockReset();
    aiObject.mockResolvedValueOnce({ ok: true, data: needs }).mockResolvedValueOnce({
      ok: true,
      data: { spec: current, scene: null },
    });
  }

  it('limits the change to the focused slide and names the selection', async () => {
    answer();
    await draftSharepic('Kürzer', 'de-DE', current, [], {}, null, 'Kürzer', {
      slide: 1,
      elements: ['sc-0-headline'],
    });

    for (const prompt of promptsOf()) {
      expect(prompt).toContain(
        'Ändere nur Folie 2, außer der Wunsch betrifft ausdrücklich das ganze Karussell.'
      );
      expect(prompt).toContain('sc-0-headline');
    }
  });

  it('adds nothing without a focus', async () => {
    answer();
    await draftSharepic('Kürzer', 'de-DE', current);

    for (const prompt of promptsOf()) expect(prompt).not.toContain('Ändere nur Folie');
  });
});

describe('draftSharepic — a revision changes only what was asked', () => {
  const current: SharepicSpec = { locale: 'de-DE', slides: [slide] };
  const RULE =
    'Ändere nur, was verlangt ist. Alles andere – Texte, Farben, Hintergrund, Layout, Folienzahl – bleibt exakt wie in der aktuellen Fassung.';
  const promptsOf = (): string[] =>
    aiObject.mock.calls.map((c) => (c[0] as { prompt: string }).prompt);

  it('tells both calls to keep everything else', async () => {
    aiObject.mockReset();
    aiObject.mockResolvedValueOnce({ ok: true, data: needs }).mockResolvedValueOnce({
      ok: true,
      data: { spec: current, scene: null },
    });
    await draftSharepic('Verschieb den Text nach oben', 'de-DE', current);

    const prompts = promptsOf();
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) expect(prompt).toContain(RULE);
  });

  it('leaves a fresh draft without it', async () => {
    aiObject.mockReset();
    aiObject.mockResolvedValueOnce({ ok: true, data: needs }).mockResolvedValueOnce({
      ok: true,
      data: { spec: current, scene: null },
    });
    await draftSharepic('Sharepic: Mehr Radwege', 'de-DE');

    for (const prompt of promptsOf()) expect(prompt).not.toContain(RULE);
  });
});
