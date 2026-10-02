import { describe, expect, it } from 'vitest';

import {
  formatOverviewDate,
  formatOverviewMonth,
  formatOverviewShare,
  overviewNewDocsDetail,
  overviewNounCase,
  overviewTermCoverage,
  overviewTermNotes,
} from './overviewFormat';

describe('overview formatting', () => {
  it('formats shares as rounded percent', () => {
    expect(formatOverviewShare(0.144)).toBe('14 %');
    expect(formatOverviewShare(0)).toBe('0 %');
  });

  it('labels a month bucket in UTC, short and long', () => {
    expect(formatOverviewMonth('2026-09')).toBe(
      new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
        Date.UTC(2026, 8, 1)
      )
    );
    expect(formatOverviewMonth('2026-09', 'long')).toBe('September 2026');
  });

  it('falls back to a dash for missing or broken dates', () => {
    expect(formatOverviewDate(null)).toBe('–');
    expect(formatOverviewDate('kein Datum')).toBe('–');
    expect(formatOverviewDate('2021-09-28')).toContain('2021');
  });

  it('compares the last 30 days with the 30 before', () => {
    expect(overviewNewDocsDetail(26, 13)).toBe('+13 gegenüber den 30 Tagen davor');
    expect(overviewNewDocsDetail(13, 1026)).toBe('−1.013 gegenüber den 30 Tagen davor');
    expect(overviewNewDocsDetail(5, 5)).toBe('so viele wie in den 30 Tagen davor');
  });

  it('capitalises lemmas', () => {
    expect(overviewNounCase('klimaschutz')).toBe('Klimaschutz');
    expect(overviewNounCase('')).toBe('');
  });

  it('says how many documents carry keywords', () => {
    expect(overviewTermCoverage(1200, 1548)).toBe(
      'Häufigste Schlagwörter aus 1.200 von 1.548 Dokumenten'
    );
    expect(overviewTermCoverage(1548, 1548)).toBe('Häufigste Schlagwörter aus 1.548 Dokumenten');
  });

  it('explains only the comparison lists that are shown', () => {
    expect(overviewTermNotes({ signature: null, rising: [] })).toBeNull();
    expect(overviewTermNotes({ signature: [], rising: [{}] })).toBe(
      '„Im Aufwind“ vergleicht die letzten 90 Tage mit den zwölf Monaten davor.'
    );
    expect(overviewTermNotes({ signature: [{}], rising: [{}] })).toBe(
      '„Typisch hier“ vergleicht mit allen anderen Landesverbänden, getrennt nach Partei- und Fraktionstexten. „Im Aufwind“ vergleicht die letzten 90 Tage mit den zwölf Monaten davor.'
    );
  });
});
