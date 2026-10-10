import { SHAREPIC_EMOJI, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic, validateDraft } from './draftAgent.js';

const BRIEF = 'Bleib aktiv: wählen, informieren, demonstrieren.';
const slide = (items: object[], color = 'tanne') => ({
  background: { kind: 'farbe', color },
  position: 'mitte',
  align: 'links',
  items,
  logo: false,
});
const liste = {
  type: 'liste',
  stil: 'emoji',
  items: ['Nutze dein **Wahlrecht**', 'Bleib informiert', 'Besuche Demos'],
  zeichen: ['🗳️', '📰', '🪧'],
};

describe('validateDraft — liste stil emoji', () => {
  it('takes an emoji list in both corporate designs', () => {
    expect(validateDraft({ slides: [slide([liste])] }, 'de-DE', BRIEF).ok).toBe(true);
    expect(validateDraft({ slides: [slide([liste], 'dunkelgruen')] }, 'de-AT', BRIEF).ok).toBe(
      true
    );
  });

  it('sends back an emoji list that misses an emoji', () => {
    const result = validateDraft(
      { slides: [slide([{ ...liste, zeichen: ['🗳️', '📰'] }])] },
      'de-DE',
      BRIEF
    );
    expect(result.ok ? '' : result.error).toContain('genau ein Emoji pro Punkt');
  });

  it('sends back an emoji outside the set', () => {
    const result = validateDraft(
      { slides: [slide([{ ...liste, zeichen: ['🗳️', '📰', '🍕'] }])] },
      'de-DE',
      BRIEF
    );
    expect(result.ok).toBe(false);
  });
});

describe('draftSharepic — the emoji list in the tool schema', () => {
  const needs = (land: string) => ({ land, anlass: [], kapitel: [], fotos_suchen: [] });
  const done: SharepicSpec['slides'][number] = {
    background: { kind: 'farbe', color: 'dunkelgruen' },
    position: 'mitte',
    align: 'links',
    items: [{ type: 'headline', lines: ['Bleib aktiv!'] }],
    logo: false,
  };

  it.each(['de-DE', 'de-AT'] as const)('describes stil emoji and its set (%s)', async (locale) => {
    aiObject.mockReset();
    aiObject.mockResolvedValueOnce({ ok: true, data: needs(locale) }).mockResolvedValueOnce({
      ok: true,
      data: {
        spec: {
          locale,
          slides: [
            {
              ...done,
              background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
            },
          ],
        },
        scene: null,
      },
    });
    await draftSharepic('Sharepic: Bleib aktiv', locale);
    const draftCall = aiObject.mock.calls[1]![0] as { schema: unknown };
    const schema = JSON.stringify(draftCall.schema);
    expect(schema).toContain('|\\"emoji\\",\\"zeichen\\"');
    for (const emoji of SHAREPIC_EMOJI) expect(schema).toContain(emoji);
  });
});
