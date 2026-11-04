import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';

const MOTIV = 'Rooftop solar panels over a small German town at golden hour';

const needs = (form: string, alternativen: string[] = []) => ({
  ok: true,
  data: { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [], form, alternativen },
});

const headline = (lines: string[]) => ({ type: 'headline', lines });
const slide = (extra: Record<string, unknown> = {}, background: Record<string, unknown> = {}) => ({
  background: { kind: 'farbe', color: 'tanne', ...background },
  position: 'mitte',
  align: 'links',
  logo: true,
  items: [headline(['Sommerfest', 'im Park'])],
  ...extra,
});

/** The draft step answers with `raw`, run through the agent's own validation. */
function answers(needsAnswer: object, raw: unknown) {
  aiObject.mockReset();
  aiObject
    .mockResolvedValueOnce(needsAnswer)
    .mockImplementationOnce(
      async (call: { validate: (i: unknown, a: number, n: number) => unknown }) => {
        const checked = call.validate(raw, 1, 1) as
          { ok: true; value: unknown } | { ok: false; error: string };
        return checked.ok ? { ok: true, data: checked.value } : checked;
      }
    );
}

const ORDER = 'Sharepic: Einladung zum Sommerfest im Park';

describe('draftSharepic — bericht', () => {
  it("names the creator's form and the missing date of an event without one", async () => {
    answers(needs('veranstaltung'), { slides: [slide()] });
    const draft = await draftSharepic(ORDER, 'de-DE');
    expect(draft.bericht).toEqual([
      { art: 'form', form: 'veranstaltung', von: 'creator' },
      { art: 'fehlt', fakt: 'termin' },
    ]);
  });

  it('does not claim a missing date when the card shows one', async () => {
    answers(needs('veranstaltung'), { slides: [slide({ datum: { date: '14.11.' } })] });
    const draft = await draftSharepic(`${ORDER} am 14.11.`, 'de-DE');
    expect(draft.bericht).toEqual([{ art: 'form', form: 'veranstaltung', von: 'creator' }]);
  });

  it('reports a date field the order did not name', async () => {
    answers(needs('veranstaltung'), { slides: [slide({ datum: { date: '14.11.' } })] });
    const draft = await draftSharepic(ORDER, 'de-DE');
    expect(draft.bericht).toContainEqual({ art: 'repariert', feld: 'datum.date', wert: '14.11.' });
  });

  it("names the swap when the brief lacks the first form's material", async () => {
    answers(needs('diagramm'), { slides: [slide()] });
    const draft = await draftSharepic('Sharepic: Mehr Busse für alle', 'de-DE');
    expect(draft.bericht).toEqual([
      { art: 'form', form: 'einzelbild', von: 'creator', statt: 'diagramm' },
    ]);
  });

  it('says the person named the form', async () => {
    answers(needs('einzelbild'), { slides: [slide()] });
    const draft = await draftSharepic('Mehr Busse für alle', 'de-DE', null, [], {}, 'einzelbild');
    expect(draft.bericht).toEqual([{ art: 'form', form: 'einzelbild', von: 'person' }]);
  });

  it("carries the scene painter's reason when the scene fails", async () => {
    const hinweis = 'Die Szene ließ sich nicht malen – die Slide hat jetzt eine Farbe.';
    answers(needs('einzelbild'), {
      slides: [slide({}, { kind: 'szene', motiv: MOTIV, textSeite: 'unten' })],
    });
    const scene = vi.fn(async () => ({ ok: false as const, hinweis }));
    const draft = await draftSharepic('Faktenbild: Solar', 'de-DE', null, [], { scene });
    expect(draft.bericht).toContainEqual({ art: 'gestaltung', text: hinweis });
    expect(draft.hinweis).toContain(hinweis);
  });

  it('is an empty list when nothing needs saying', async () => {
    answers(
      { ok: true, data: { land: 'de-DE', anlass: [], kapitel: [], fotos_suchen: [] } },
      {
        slides: [slide()],
      }
    );
    const draft = await draftSharepic('Sharepic: Mehr Busse für alle', 'de-DE', slideCurrent());
    expect(draft.bericht).toEqual([]);
  });
});

function slideCurrent() {
  return { locale: 'de-DE' as const, slides: [slide()] } as never;
}
