import { describe, expect, it } from 'vitest';

import { sharepicSlideSchema } from '@gruenerator/contracts';

import { weekdayId, weekdaysIn } from './briefFacts.js';
import { repairDatum } from './datumRepair.js';
import { validateDraft } from './draftAgent.js';

const BRIEF =
  'Unser Gemeinschaftsgarten in Kassel ist eröffnet! Kommt vorbei: Samstag, 10 Uhr, Gartenstraße 5.';
const BRIEF_NO_TIME = 'Infostand am Samstag auf dem Marktplatz. Kommt vorbei!';
const BRIEF_WITH_DATE = 'Sommerfest am 14.11. um 19 Uhr im Café Linde.';

/** What is left of the first slide's datum after the repair, and what was dropped. */
const repair = (datum: object, given: string) => {
  const { input, repairs } = repairDatum(withDatum(datum), given);
  const slide = (input as ReturnType<typeof withDatum>).slides[0] as { datum?: object };
  return { datum: slide.datum, repairs: repairs.map((r) => r.feld) };
};

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
  it('drops a date the brief does not give instead of rejecting', () => {
    const out = repair({ weekday: 'Sa', date: '10.00', time: '10 Uhr' }, BRIEF);
    expect(out.datum).toEqual({ weekday: 'Sa', time: '10 Uhr' });
    expect(out.repairs).toEqual(['datum.date']);
  });

  it('drops the time repeated as a date, even when the brief names that time', () => {
    const out = repair(
      { weekday: 'Sa', date: '10.00', time: '10 Uhr' },
      `${BRIEF} Start 10.00 Uhr.`
    );
    expect(out.datum).toEqual({ weekday: 'Sa', time: '10 Uhr' });
    expect(out.repairs).toEqual(['datum.date']);
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

  it('drops a different day', () => {
    const out = repair(
      { weekday: 'Sa', date: '16.11.', time: '10 Uhr' },
      'Infostand am Samstag, 15. November, 10 Uhr.'
    );
    expect(out.datum).toEqual({ weekday: 'Sa', time: '10 Uhr' });
    expect(out.repairs).toEqual(['datum.date']);
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

    it('drops a time the brief does not give', () => {
      const out = repair({ weekday: 'Sa', time: '10 Uhr' }, BRIEF_NO_TIME);
      expect(out.datum).toEqual({ weekday: 'Sa' });
      expect(out.repairs).toEqual(['datum.time']);
    });
  });

  describe('time against the times the brief states', () => {
    const run = (time: string, brief: string) =>
      repair({ weekday: 'Sa', time }, brief).repairs.length === 0;

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
      ['14 Uhr', 'Fest am Samstag, 14.11. auf dem Marktplatz.'],
      ['11 Uhr', 'Infostand am Samstag um 10 Uhr.'],
      ['9–13 Uhr', 'Infostand am Samstag von 10 bis 13 Uhr.'],
    ])('drops %s against "%s"', (time, brief) => {
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

describe('repairDatum', () => {
  it.each([
    [
      'everything invented',
      { weekday: 'Do', date: '14.11.', time: '18 Uhr' },
      'Wir laden zum Treffen ein.',
      ['datum.time', 'datum.date', 'datum.weekday', 'datum'],
    ],
    ['time only, not in the order', { time: '18 Uhr' }, 'Wir laden ein.', ['datum.time', 'datum']],
    [
      'the time repeated as a date, weekday not ordered',
      { weekday: 'Mo', date: '10.00', time: '10 Uhr' },
      'um 10 Uhr',
      ['datum.date', 'datum.weekday', 'datum'],
    ],
  ])('removes the whole datum: %s', (_name, datum, given, repairs) => {
    const out = repair(datum, given);
    expect(out.datum).toBeUndefined();
    expect(out.repairs).toEqual(repairs);
  });

  it.each([
    ['am Donnerstag um 19 Uhr', { weekday: 'Donnerstag', time: '19 Uhr' }],
    ['Donnerstagabend', { weekday: 'Do.' }],
    ['am 20. Jänner', { date: '20.1.' }],
  ])('leaves a datum the order backs: %s', (given, datum) => {
    const out = repair(datum, given);
    expect(out.datum).toEqual(datum);
    expect(out.repairs).toEqual([]);
  });

  it('drops a weekday the order only mimics ("So geht\'s nicht weiter")', () => {
    const out = repair({ weekday: 'So' }, "So geht's nicht weiter – Infoabend");
    expect(out.datum).toBeUndefined();
    expect(out.repairs).toEqual(['datum.weekday', 'datum']);
  });

  it('removes an empty datum and an empty date', () => {
    expect(repair({}, 'Fest').datum).toBeUndefined();
    expect(repair({ weekday: 'Sa', date: '' }, 'am Samstag').datum).toEqual({ weekday: 'Sa' });
  });

  it('does not touch an input without slides or datum', () => {
    expect(repairDatum('x', 'y')).toEqual({ input: 'x', repairs: [] });
    const spec = withDatum({ weekday: 'Sa' });
    delete (spec.slides[0] as { datum?: object }).datum;
    expect(repairDatum(spec, 'Fest').repairs).toEqual([]);
  });
});

describe('weekdaysIn', () => {
  it('reads names, abbreviations, compounds and case', () => {
    expect(weekdaysIn('Mi., Freitag und sonntags')).toEqual(new Set(['mi', 'fr', 'so']));
    expect(weekdaysIn('Donnerstagabend')).toEqual(new Set(['do']));
    expect(weekdaysIn('SAMSTAG, Mo. und Di.')).toEqual(new Set(['sa', 'mo', 'di']));
  });
  it('reads ranges and lists of abbreviations', () => {
    expect(weekdaysIn('Mo–Fr 9 Uhr')).toEqual(new Set(['mo', 'fr']));
    expect(weekdaysIn('Sa./So.')).toEqual(new Set(['sa', 'so']));
    expect(weekdaysIn('Sa/So')).toEqual(new Set(['sa', 'so']));
  });
  it.each([
    ['am Do um 19 Uhr', 'do'],
    ['Do 19 Uhr', 'do'],
    ['Sa, 14.11.', 'sa'],
    ['jeden Mi', 'mi'],
    ['ab Fr', 'fr'],
    ['bis So', 'so'],
  ])('reads the undotted short form in "%s"', (text, id) => {
    expect(weekdaysIn(text)).toEqual(new Set([id]));
  });
  it('ignores ordinary words', () => {
    expect(weekdaysIn('so wird das, wir sind dort')).toEqual(new Set());
  });
  it.each([
    "So geht's nicht weiter",
    'Das war es und so.',
    'Fr. Müller lädt ein',
    'Sonntagsfrage',
    'Die Montage der Anlage',
    // Deliberate: „Montagsdemo“ names a recurring event, not a date; matching it
    // would also need „Montage“-style prefixes, so it counts as no weekday.
    'Montagsdemo',
    'Mo ist ein Name, Di auch',
    'Mo Farah läuft',
  ])('names no weekday in "%s"', (text) => {
    expect(weekdaysIn(text).size).toBe(0);
  });
  it.each([['Domino'], ['Sonntagsfrage'], ['Montage'], ['Sonn'], ['']])(
    'reads the model value %j as no weekday',
    (value) => {
      expect(weekdayId(value)).toBeNull();
    }
  );
  it.each([
    ['Do', 'do'],
    ['do.', 'do'],
    ['Donnerstag', 'do'],
    ['Donnerstagabend', 'do'],
    ['So.', 'so'],
  ])('reads the model value %j as %s', (value, id) => {
    expect(weekdayId(value)).toBe(id);
  });
});
