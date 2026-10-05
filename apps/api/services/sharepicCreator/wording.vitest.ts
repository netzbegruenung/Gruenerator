import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const SURVEY =
  'Umfrage im Landkreis Göttingen: 72 Prozent wünschen sich mehr Busverbindungen auf dem Land, 18 Prozent sind zufrieden, 10 Prozent ohne Meinung.';

const slideWith = (items: object[], extra: object = {}) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'mint' },
      position: 'oben',
      align: 'links',
      items,
      logo: true,
      ...extra,
    },
  ],
});

const donut = (names: [string, string, string]) =>
  slideWith([
    { type: 'headline', lines: ['Mehr Busse', 'für das Land'] },
    {
      type: 'diagramm',
      art: 'donut',
      einheit: '%',
      werte: [
        { name: names[0], wert: 72 },
        { name: names[1], wert: 18 },
        { name: names[2], wert: 10 },
      ],
    },
  ]);

describe('chart labels', () => {
  it('takes labels in the words of the brief', () => {
    const result = validateDraft(
      donut(['Wünschen sich mehr', 'Zufrieden', 'Ohne Meinung']),
      'de-DE',
      SURVEY
    );
    expect(result.ok).toBe(true);
  });

  it('takes an inflected brief word', () => {
    const result = validateDraft(
      donut(['Mehr Busverbindungen', 'Zufriedene', 'Ohne Meinung']),
      'de-DE',
      SURVEY
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a label word the brief does not have, and quotes the brief', () => {
    const result = validateDraft(
      donut(['Wunsch nach mehr Busen', 'Zufrieden', 'Ohne Meinung']),
      'de-DE',
      SURVEY
    );
    expect(!result.ok && result.error).toMatch(/Wunsch nach mehr Busen/);
    expect(!result.ok && result.error).toMatch(/wünschen sich mehr Busverbindungen/);
  });

  it('keeps the labels of the current draft in a revision', () => {
    const current = donut(['Wünschen sich mehr', 'Zufrieden', 'Ohne Meinung']);
    const result = validateDraft(
      current,
      'de-DE',
      `Mach den Titel kürzer\n${JSON.stringify(current)}`
    );
    expect(result.ok).toBe(true);
  });
});

describe('embarrassing words', () => {
  it('rejects one in a headline the brief does not have', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Mehr Busen', 'für das Land'] }]),
      'de-DE',
      SURVEY
    );
    expect(!result.ok && result.error).toMatch(/„Busen“/);
  });

  it('lets the brief use its own words', () => {
    const result = validateDraft(
      slideWith([
        { type: 'headline', lines: ['Vorsorge rettet', 'Leben'] },
        { type: 'text', text: 'Abtasten der Brüste hilft.' },
      ]),
      'de-DE',
      'Brustkrebsvorsorge: Das regelmäßige Abtasten der Brüste hilft, früh zu erkennen.'
    );
    expect(result.ok).toBe(true);
  });

  it('does not flag a longer word that merely contains one', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Sexualkunde', 'an jeder Schule'] }]),
      'de-DE',
      'Aufklärung an Schulen stärken'
    );
    expect(result.ok).toBe(true);
  });
});

describe('date circle without a weekday', () => {
  it('takes a date the brief names without its weekday', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Geh wählen'] }], { datum: { date: '14.3.' } }),
      'de-DE',
      'Am 14. März ist Kommunalwahl in Hessen. Geh wählen!'
    );
    expect(result.ok).toBe(true);
  });

  it('puts the date the request names in the circle when the draft drops it', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Geh wählen'] }]),
      'de-DE',
      'Am 14. März ist Kommunalwahl in Hessen. Geh wählen!'
    );
    expect(result.ok && result.value.slides[0]!.datum).toEqual({ date: '14.3.' });
  });

  it('adds the date to a circle that has only the weekday', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Geh wählen'] }], { datum: { weekday: 'So' } }),
      'de-DE',
      'Am Sonntag, 14. März ist Kommunalwahl. Geh wählen!'
    );
    expect(result.ok && result.value.slides[0]!.datum).toEqual({ weekday: 'So', date: '14.3.' });
  });

  it('does not read a decimal as a date', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Klimaziel', 'halten'] }]),
      'de-DE',
      'Das 1.5 Grad Ziel muss halten'
    );
    expect(result.ok && result.value.slides[0]!.datum).toBeUndefined();
  });

  it('leaves a date that stands in the text alone', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Am 14. März', 'wählen gehen'] }]),
      'de-DE',
      'Am 14. März ist Kommunalwahl in Hessen. Geh wählen!'
    );
    expect(result.ok && result.value.slides[0]!.datum).toBeUndefined();
  });

  it('lets a revision drop the date when the change asks for it', () => {
    const current = slideWith([{ type: 'headline', lines: ['Geh wählen'] }], {
      datum: { date: '14.3.' },
    });
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Geh wählen'] }]),
      'de-DE',
      `Mach das Datum weg\n${JSON.stringify(current)}`,
      [],
      'Mach das Datum weg'
    );
    expect(result.ok && result.value.slides[0]!.datum).toBeUndefined();
  });

  it('does not ask for a date that only the conversation material names', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Mehr Busse', 'für das Land'] }]),
      'de-DE',
      'Mach ein Sharepic zu mehr Bussen\n\nMaterial aus dem Gespräch: Beschluss vom 3. Oktober',
      [],
      'Mach ein Sharepic zu mehr Bussen'
    );
    expect(result.ok && result.value.slides[0]!.datum).toBeUndefined();
  });

  it('still needs a weekday or a date', () => {
    const result = validateDraft(
      slideWith([{ type: 'headline', lines: ['Geh wählen'] }], { datum: { time: '18 Uhr' } }),
      'de-DE',
      'Wahl um 18 Uhr'
    );
    expect(result.ok).toBe(false);
  });
});
