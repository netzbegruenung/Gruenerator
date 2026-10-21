import { describe, expect, it } from 'vitest';

import { sharepicSlideSchema } from '@gruenerator/contracts';

import { validateDraft } from './draftAgent.js';

const BRIEF =
  'Unser Gemeinschaftsgarten in Kassel ist eröffnet! Kommt vorbei: Samstag, 10 Uhr, Gartenstraße 5.';
const BRIEF_NO_TIME = 'Infostand am Samstag auf dem Marktplatz. Kommt vorbei!';
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

  it('takes 15.11. for a brief that writes the month out, and the other way round', () => {
    const spelled = 'Infostand am Samstag, 15. November, 10–13 Uhr auf dem Königsplatz.';
    expect(
      validateDraft(withDatum({ weekday: 'Sa', date: '15.11.', time: '10 Uhr' }), 'de-DE', spelled)
        .ok
    ).toBe(true);
    expect(
      validateDraft(
        withDatum({ weekday: 'Fr', date: '14. Nov.', time: '19 Uhr' }),
        'de-DE',
        BRIEF_WITH_DATE
      ).ok
    ).toBe(true);
  });

  it('reads the Austrian Jänner', () => {
    const brief = 'Neujahrsempfang am 12. Jänner um 18 Uhr in Graz.';
    expect(
      validateDraft(withDatum({ weekday: 'Mo', date: '12.1.', time: '18 Uhr' }), 'de-AT', brief).ok
    ).toBe(true);
  });

  it('accepts a real date that looks like the hour', () => {
    const brief = 'Stammtisch am 10. Oktober um 10 Uhr.';
    expect(
      validateDraft(withDatum({ weekday: 'Fr', date: '10.10.', time: '10 Uhr' }), 'de-DE', brief).ok
    ).toBe(true);
  });

  it('still rejects a different day', () => {
    const spelled = 'Infostand am Samstag, 15. November, 10 Uhr.';
    expect(
      validateDraft(withDatum({ weekday: 'Sa', date: '16.11.', time: '10 Uhr' }), 'de-DE', spelled)
        .ok
    ).toBe(false);
  });

  describe('without a time', () => {
    it('lets the schema take a datum with weekday only or weekday and date', () => {
      const slide = withDatum({ weekday: 'Sa' }).slides[0]!;
      expect(sharepicSlideSchema.safeParse(slide).success).toBe(true);
      expect(
        sharepicSlideSchema.safeParse({ ...slide, datum: { weekday: 'Sa', date: '14.11.' } })
          .success
      ).toBe(true);
    });

    it('passes a brief without a time when the spec has none', () => {
      expect(validateDraft(withDatum({ weekday: 'Sa' }), 'de-DE', BRIEF_NO_TIME).ok).toBe(true);
    });

    it('takes a date from the brief without a time', () => {
      expect(
        validateDraft(withDatum({ weekday: 'Fr', date: '14.11.' }), 'de-AT', 'Fest am 14.11.').ok
      ).toBe(true);
    });

    it('still rejects a time the brief does not give', () => {
      const result = validateDraft(
        withDatum({ weekday: 'Sa', time: '10 Uhr' }),
        'de-DE',
        BRIEF_NO_TIME
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/datum\.time/);
    });
  });

  describe('time against the times the brief states', () => {
    const run = (time: string, brief: string) =>
      validateDraft(withDatum({ weekday: 'Sa', time }), 'de-DE', brief).ok;

    it.each([
      ['10:00', 'Infostand am Samstag um 10 Uhr.'],
      ['18:00', 'Infostand am Samstag ab 18h.'],
      ['18:30', 'Infostand am Samstag ab 18.30 Uhr.'],
      ['20:30', 'Infostand am Samstag um 20 Uhr 30.'],
      ['10 Uhr', 'Infostand am Samstag um zehn Uhr.'],
      // Live 21.10.2026: rejected three times, the draft only passed on the rescue model.
      ['10–13 Uhr', 'Infostand am Samstag von 10 bis 13 Uhr auf dem Altmarkt.'],
      ['10-13 Uhr', 'Infostand am Samstag von 10 bis 13 Uhr auf dem Altmarkt.'],
      ['10–13 Uhr', 'Infostand am Samstag 10–13 Uhr.'],
      ['10 Uhr', 'Infostand am Samstag 10 bis 13 Uhr.'],
      ['10:30–13 Uhr', 'Infostand am Samstag von 10:30 bis 13 Uhr.'],
    ])('passes %s against "%s"', (time, brief) => {
      expect(run(time, brief)).toBe(true);
    });

    it.each([
      ['14 Uhr', 'Fest am 14.11. auf dem Marktplatz.'],
      ['11 Uhr', 'Infostand am Samstag um 10 Uhr.'],
      ['9–13 Uhr', 'Infostand am Samstag von 10 bis 13 Uhr.'],
    ])('rejects %s against "%s"', (time, brief) => {
      expect(run(time, brief)).toBe(false);
    });
  });

  describe('a circle without the time the request names', () => {
    // Live 21.10.2026: Gemma closed datum after its first field, three times in three.
    const timeOf = (datum: object, brief: string, items?: object[]) => {
      const spec = withDatum(datum);
      if (items) spec.slides[0]!.items = items as (typeof spec.slides)[0]['items'];
      const result = validateDraft(spec, 'de-DE', brief);
      return result.ok ? result.value.slides[0]!.datum?.time : 'rejected';
    };

    it.each([
      ['Stammtisch am Donnerstag, 6.11., um 19 Uhr im Gasthaus.', '19 Uhr'],
      ['Infostand am Samstag, 8.11., von 10 bis 13 Uhr auf dem Altmarkt.', '10–13 Uhr'],
      ['Infostand am Samstag, 8.11., 10–13 Uhr.', '10–13 Uhr'],
      ['Lesung am 14.11. ab 18.30 Uhr.', '18:30 Uhr'],
      ['Lesung am 14.11. um 18:30.', '18:30 Uhr'],
    ])('gets it from "%s"', (brief, time) => {
      expect(timeOf({ weekday: 'Do' }, brief)).toBe(time);
    });

    it('keeps the time the model set', () => {
      expect(timeOf({ weekday: 'Do', time: '19 Uhr' }, 'Stammtisch am Do um 19 Uhr.')).toBe(
        '19 Uhr'
      );
    });

    it('leaves it out when the request names several times', () => {
      expect(timeOf({ weekday: 'Do' }, 'Einlass 18 Uhr, Beginn 19 Uhr.')).toBeUndefined();
    });

    it('leaves it out when the slide text already says it', () => {
      const items = [
        { type: 'headline', lines: ['Garten offen'] },
        { type: 'text', text: 'Komm um 19 Uhr vorbei!' },
      ];
      expect(timeOf({ weekday: 'Do' }, 'Treffen am Do um 19 Uhr.', items)).toBeUndefined();
    });
  });
});
