import { describe, expect, it } from 'vitest';

import {
  anstehendeVeranstaltungen,
  reisezeitenVon,
  VERANSTALTUNGEN,
  zeitraumText,
} from './veranstaltungen.js';

describe('veranstaltungen', () => {
  it('has unique ids and a Funktion for every event', () => {
    const ids = VERANSTALTUNGEN.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VERANSTALTUNGEN.every((v) => v.funktion.length > 0)).toBe(true);
  });

  it('prefills only travel times whose hour is known', () => {
    expect(reisezeitenVon({ beginn: '2026-10-17T11:00', ende: '2026-10-18' })).toEqual({
      reisebeginn: '2026-10-17T11:00',
      rueckkehr: '',
    });
    expect(reisezeitenVon({})).toEqual({ reisebeginn: '', rueckkehr: '' });
  });

  it('formats a range and a single day', () => {
    expect(zeitraumText({ beginn: '2026-12-04T15:00', ende: '2026-12-06T14:00' })).toBe(
      '04.12.–06.12.2026'
    );
    expect(zeitraumText({ beginn: '2026-11-07T10:00', ende: '2026-11-07' })).toBe('07.11.2026');
  });

  it('hides events that are over and sorts the rest by date', () => {
    const list = anstehendeVeranstaltungen(new Date('2026-10-12T09:00:00'));
    const ids = list.map((v) => v.id);
    expect(ids).not.toContain('lpt-by-2026'); // ended 11.10.
    expect(ids).toContain('laenderrat'); // undated stays
    const dated = list.filter((v) => v.beginn).map((v) => v.beginn ?? '');
    expect(dated).toEqual([...dated].sort());
  });

  it('keeps an event on its last day', () => {
    const ids = anstehendeVeranstaltungen(new Date('2026-10-11T20:00:00')).map((v) => v.id);
    expect(ids).toContain('lpt-by-2026');
  });
});
