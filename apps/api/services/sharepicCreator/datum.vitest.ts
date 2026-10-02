import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const BRIEF =
  'Unser Gemeinschaftsgarten in Kassel ist eröffnet! Kommt vorbei: Samstag, 10 Uhr, Gartenstraße 5.';
const BRIEF_WITH_DATE = 'Sommerfest am 14.11. um 19 Uhr im Café Linde.';

const withDatum = (datum: object) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'weiss' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Garten offen'] }],
      datum,
      logo: true,
    },
  ],
});

describe('datum in a draft', () => {
  it('rejects a date the brief does not give, and says to leave it out', () => {
    const result = validateDraft(
      withDatum({ weekday: 'Sa', date: '10.00', time: '10 Uhr' }),
      'de-DE',
      BRIEF
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/date.*(leer|weglassen)/);
  });

  it('rejects the time repeated as a date, even when the brief names that time', () => {
    const result = validateDraft(
      withDatum({ weekday: 'Sa', date: '10.00', time: '10 Uhr' }),
      'de-DE',
      `${BRIEF} Start 10.00 Uhr.`
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a circle with weekday and time only', () => {
    const result = validateDraft(withDatum({ weekday: 'Sa', time: '10 Uhr' }), 'de-DE', BRIEF);
    expect(result.ok).toBe(true);
  });

  it('accepts a date that stands in the brief', () => {
    const result = validateDraft(
      withDatum({ weekday: 'Fr', date: '14.11.', time: '19 Uhr' }),
      'de-AT',
      BRIEF_WITH_DATE
    );
    expect(result.ok).toBe(true);
  });
});
