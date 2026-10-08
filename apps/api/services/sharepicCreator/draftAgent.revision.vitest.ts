import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';
import { chapterText } from './styleguide.js';

type Validate = (
  input: unknown,
  attempt?: number,
  attempts?: number
) => { ok: boolean; error?: string; value?: unknown };

const current: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'mint' },
      position: 'mitte',
      align: 'links',
      logo: true,
      items: [
        {
          type: 'zitat',
          text: 'Klimaschutz ist Gerechtigkeit',
          name: 'Anna Beispiel',
          funktion: 'Landtagsabgeordnete',
        },
      ],
    },
  ],
};
const withoutFunction = {
  slides: [
    {
      ...current.slides[0],
      items: [{ type: 'zitat', text: 'Klimaschutz ist Gerechtigkeit', name: 'Anna Beispiel' }],
    },
  ],
};
const needs = {
  land: 'de-DE',
  anlass: ['zitat'],
  kapitel: ['liste-zahl'],
  fotos_suchen: [],
  form: 'zitat',
  alternativen: [],
};

let validate: Validate = () => ({ ok: false });
let system = '';

beforeEach(() => {
  aiObject.mockReset();
  aiObject
    .mockResolvedValueOnce({ ok: true, data: needs })
    .mockImplementationOnce((call: { validate: Validate; system: string }) => {
      validate = call.validate;
      system = call.system;
      return Promise.resolve({
        ok: true,
        data: { spec: { ...current }, scene: null },
      });
    });
});

describe('draftSharepic — a revision', () => {
  it('leaves the needs step’s chapters and examples out (#4252)', async () => {
    const result = await draftSharepic('Mach die Headline kürzer', 'de-DE', current);
    expect(system).not.toContain(chapterText('liste-zahl'));
    expect(result.chapters).toEqual([]);
  });

  it('rejects a draft that drops a field the request does not name, then restores it', async () => {
    await draftSharepic('Mach die Headline kürzer und knackiger', 'de-DE', current);
    const first = validate(withoutFunction, 1, 3);
    expect(first.ok).toBe(false);
    expect(first.error).toContain('funktion „Landtagsabgeordnete“');
    expect(validate(withoutFunction, 2, 3).ok).toBe(false);
    const last = validate(withoutFunction, 3, 3) as {
      ok: true;
      value: { spec: SharepicSpec; kept: string | null };
    };
    expect(last.ok).toBe(true);
    expect(last.value.spec.slides[0]!.items[0]).toMatchObject({ funktion: 'Landtagsabgeordnete' });
    expect(last.value.kept).toContain('Landtagsabgeordnete');
  });

  it('restores on the model’s last attempt, however often validate ran before', async () => {
    await draftSharepic('Mach die Headline kürzer und knackiger', 'de-DE', current);
    // Attempts 1 and 2 threw: the first validate call already is the last attempt.
    expect(validate(withoutFunction, 3, 3).ok).toBe(true);
  });

  it('lets a field go when the request names it', async () => {
    await draftSharepic('Entferne die Funktion unter dem Namen', 'de-DE', current);
    expect(validate(withoutFunction, 1, 3).ok).toBe(true);
  });

  it('lets a field go when only the brief names it, on a bare confirmation', async () => {
    await draftSharepic(
      'Ja, mach das',
      'de-DE',
      current,
      [],
      {},
      null,
      'Ja, mach das',
      null,
      'Lass die Funktion unter dem Namen weg'
    );
    expect(validate(withoutFunction, 1, 3).ok).toBe(true);
  });

  it('reads no conversation material from the prompt as the request', async () => {
    await draftSharepic(
      'Ja, mach das\n\nRecherchierte Quellen dazu:\nDie Funktion des Gesetzes …',
      'de-DE',
      current,
      [],
      {},
      null,
      'Ja, mach das',
      null,
      'Kürze die Headline'
    );
    expect(validate(withoutFunction, 1, 3).ok).toBe(false);
  });

  describe('on a carousel slide the request names', () => {
    const slide = (lines: string[]) => ({
      background: { kind: 'farbe' as const, color: 'tanne' as const },
      position: 'mitte' as const,
      align: 'links' as const,
      logo: false,
      items: [{ type: 'headline' as const, lines }],
    });
    const deck: SharepicSpec = {
      locale: 'de-DE',
      slides: [slide(['5 Gründe für', 'mehr Radwege']), slide(['Sicherer', 'für alle'])],
    };
    const sent = (slides: unknown[]) => ({ slides });

    it('rejects a draft that hands the named slide back unchanged, then lets it pass', async () => {
      await draftSharepic('bei der 1. slide einen anderen text wählen', 'de-DE', deck);
      const same = sent(deck.slides);
      const first = validate(same, 1, 3);
      expect(first.ok).toBe(false);
      expect(first.error).toContain('Folie 1 ist unverändert');
      expect(validate(same, 3, 3).ok).toBe(true);
    });

    it('takes a changed key order for no change', async () => {
      await draftSharepic('Slide 2 anderer Text', 'de-DE', deck);
      const reordered = sent(deck.slides.map(({ logo, ...rest }) => ({ logo, ...rest })));
      expect(validate(reordered, 1, 3).error).toContain('Folie 2 ist unverändert');
    });

    it('accepts the rewritten slide', async () => {
      await draftSharepic('bei der 1. slide einen anderen text wählen', 'de-DE', deck);
      expect(validate(sent([slide(['Mehr Platz', 'fürs Rad']), deck.slides[1]]), 1, 3).ok).toBe(
        true
      );
    });

    it('also holds a slide named by what it shows', async () => {
      const listed: SharepicSpec = {
        ...deck,
        slides: [
          deck.slides[0]!,
          { ...deck.slides[1]!, items: [{ type: 'liste', items: ['Sicherer', 'Gesünder'] }] },
        ],
      };
      await draftSharepic('Die Folie mit der Liste bitte anders formulieren', 'de-DE', listed);
      expect(validate(sent(listed.slides), 1, 3).error).toContain('Folie 2 ist unverändert');
    });

    it('does not insist on a quote slide, whose words only the request gives', async () => {
      const quotes: SharepicSpec = { ...deck, slides: [deck.slides[0]!, current.slides[0]!] };
      await draftSharepic('bei der 2. slide einen anderen text wählen', 'de-DE', quotes);
      expect(validate(sent(quotes.slides), 1, 3).ok).toBe(true);
    });
  });
});
