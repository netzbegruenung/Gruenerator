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
    aiObject
      .mockResolvedValueOnce({ ok: true, data: needs })
      .mockResolvedValueOnce({ ok: true, data: { locale: 'de-DE', slides: [slide] } });
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
      data: { locale: 'de-DE', format: 'post-portrait', slides: [slide] },
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
