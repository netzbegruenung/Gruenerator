import { describe, expect, it } from 'vitest';

import { RECHECK_SPREAD_DAYS, isFreshlyIndexed, recheckBucket } from './recheckSchedule.js';

const DAY = 24 * 60 * 60 * 1000;
const URL_UNDER_TEST = 'https://gruene-berlin.de/beschluesse/alt_2019';
const OTHER_URL = 'https://gruene-berlin.de/beschluesse/anders_2018';

/** Ein Zeitpunkt, an dem der Bucket von `url` dran ist — 2026-09-23 oder kurz danach. */
function dueDayFor(url: string): number {
  const start = Math.floor(Date.UTC(2026, 8, 23) / DAY);
  const offset =
    (recheckBucket(url) - (start % RECHECK_SPREAD_DAYS) + RECHECK_SPREAD_DAYS) %
    RECHECK_SPREAD_DAYS;
  return (start + offset) * DAY + 12 * 60 * 60 * 1000;
}

const iso = (ms: number) => new Date(ms).toISOString();

describe('isFreshlyIndexed — junge Inhalte (unverändert gegenüber vorher)', () => {
  const now = Date.UTC(2026, 8, 23, 12);
  const young = iso(now - 100 * DAY);

  it('überspringt, was vor weniger als drei Tagen indexiert wurde', () => {
    expect(
      isFreshlyIndexed(URL_UNDER_TEST, { published_at: young, indexed_at: iso(now - DAY) }, now)
    ).toBe(true);
  });

  it('holt neu, sobald die Indexierung drei Tage alt ist', () => {
    expect(
      isFreshlyIndexed(URL_UNDER_TEST, { published_at: young, indexed_at: iso(now - 4 * DAY) }, now)
    ).toBe(false);
  });

  it('holt Punkte ohne indexed_at und fehlende Punkte neu', () => {
    expect(isFreshlyIndexed(URL_UNDER_TEST, { published_at: young }, now)).toBe(false);
    expect(isFreshlyIndexed(URL_UNDER_TEST, null, now)).toBe(false);
  });

  it('behandelt undatierte Punkte wie junge', () => {
    expect(isFreshlyIndexed(URL_UNDER_TEST, { indexed_at: iso(now - DAY) }, now)).toBe(true);
    expect(isFreshlyIndexed(URL_UNDER_TEST, { indexed_at: iso(now - 4 * DAY) }, now)).toBe(false);
  });
});

describe('isFreshlyIndexed — alte Inhalte (gestaffelte Nachprüfung)', () => {
  const now = dueDayFor(URL_UNDER_TEST);
  const old = iso(now - 3 * 365 * DAY);
  const longAgo = iso(now - 400 * DAY);

  it('überspringt einen vor zehn Tagen geprüften Punkt, auch wenn sein Bucket dran ist', () => {
    expect(
      isFreshlyIndexed(
        URL_UNDER_TEST,
        { published_at: old, indexed_at: longAgo, checked_at: iso(now - 10 * DAY) },
        now
      )
    ).toBe(true);
  });

  it('holt einen vor 100 Tagen geprüften Punkt neu, wenn sein Bucket heute dran ist', () => {
    expect(
      isFreshlyIndexed(
        URL_UNDER_TEST,
        { published_at: old, indexed_at: longAgo, checked_at: iso(now - 100 * DAY) },
        now
      )
    ).toBe(false);
  });

  it('überspringt ihn an jedem anderen Tag', () => {
    const payload = { published_at: old, indexed_at: longAgo, checked_at: iso(now - 100 * DAY) };
    expect(isFreshlyIndexed(URL_UNDER_TEST, payload, now + DAY)).toBe(true);
    expect(isFreshlyIndexed(URL_UNDER_TEST, payload, now - DAY)).toBe(true);
  });

  it('verteilt Punkte ohne checked_at über den Bucket statt alle auf einmal zu holen', () => {
    const payload = { published_at: old, indexed_at: longAgo };
    expect(isFreshlyIndexed(URL_UNDER_TEST, payload, now)).toBe(false);
    expect(isFreshlyIndexed(URL_UNDER_TEST, payload, now + DAY)).toBe(true);
  });

  it('holt am selben Tag nur einen Bruchteil der alten Punkte', () => {
    const urls = Array.from({ length: 4500 }, (_, i) => `https://gruene.example/archiv/${i}`);
    const due = urls.filter((url) => !isFreshlyIndexed(url, { published_at: old }, now));
    // Erwartet ~50 je Tag; die Schranke fängt einen Bucket, der alles auf einen Tag legt.
    expect(due.length).toBeGreaterThan(20);
    expect(due.length).toBeLessThan(100);
  });

  it('legt verschiedene URLs auf verschiedene Buckets', () => {
    expect(recheckBucket(URL_UNDER_TEST)).not.toBe(recheckBucket(OTHER_URL));
  });
});
