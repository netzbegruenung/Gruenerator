import { describe, expect, it } from 'vitest';

import { GONE_CONFIRM_AFTER_MS, classifyFetch, goneVerdict } from './goneState.js';

const PAGE = 'https://gruene-sachsen-anhalt.de/pressemitteilungen/landesregierung-beim-hitzeschutz';
const LISTING = ['/pressemitteilungen/'];
const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 23, 12);
const iso = (ms: number) => new Date(ms).toISOString();

const redirectTo = (finalUrl: string) =>
  classifyFetch({ requestedUrl: PAGE, status: 200, finalUrl, listingPaths: LISTING });

describe('classifyFetch', () => {
  it('404 und 410 sind weg', () => {
    for (const status of [404, 410]) {
      expect(
        classifyFetch({ requestedUrl: PAGE, status, finalUrl: null, listingPaths: LISTING })
      ).toBe('gone');
    }
  });

  it('5xx, 403 und Netzfehler sind vorübergehend, nie weg', () => {
    for (const status of [500, 503, 403, 401, null]) {
      expect(
        classifyFetch({ requestedUrl: PAGE, status, finalUrl: null, listingPaths: LISTING })
      ).toBe('transient');
    }
  });

  it('200 ohne Weiterleitung ist live', () => {
    expect(redirectTo(PAGE)).toBe('live');
    expect(
      classifyFetch({ requestedUrl: PAGE, status: 200, finalUrl: null, listingPaths: LISTING })
    ).toBe('live');
  });

  it('Weiterleitung auf einen anderen Pfad desselben Hosts ist umgezogen', () => {
    expect(
      redirectTo('https://gruene-sachsen-anhalt.de/pressemitteilungen/hitzeschutz-im-blindflug')
    ).toBe('moved');
  });

  it('nur Schrägstrich, Query oder www/https geändert ist keine Weiterleitung', () => {
    expect(redirectTo(`${PAGE}/`)).toBe('live');
    expect(redirectTo(`${PAGE}?L=0`)).toBe('live');
    expect(redirectTo(PAGE.replace('https://', 'https://www.'))).toBe('live');
    expect(
      classifyFetch({
        requestedUrl: PAGE.replace('https://', 'http://'),
        status: 200,
        finalUrl: PAGE,
        listingPaths: LISTING,
      })
    ).toBe('live');
  });

  it('Weiterleitung auf die Startseite oder die Listing-Seite ist weg', () => {
    expect(redirectTo('https://gruene-sachsen-anhalt.de/')).toBe('gone');
    expect(redirectTo('https://gruene-sachsen-anhalt.de')).toBe('gone');
    expect(redirectTo('https://gruene-sachsen-anhalt.de/pressemitteilungen')).toBe('gone');
  });

  it('Weiterleitung auf einen anderen Host ist weg', () => {
    expect(redirectTo('https://gruene.de/pressemitteilungen/hitzeschutz-im-blindflug')).toBe(
      'gone'
    );
  });
});

describe('goneVerdict', () => {
  const stored = (mark: string | null) => (mark ? { lv_gone_since: mark } : { title: 'x' });

  it('markiert beim ersten Sichten', () => {
    expect(goneVerdict('gone', stored(null), now)).toBe('mark');
    expect(goneVerdict('moved', stored(null), now)).toBe('mark');
  });

  it('wartet, solange die Marke jünger als 24 h ist', () => {
    expect(goneVerdict('gone', stored(iso(now - 2 * HOUR)), now)).toBe('none');
    expect(goneVerdict('gone', stored(iso(now - GONE_CONFIRM_AFTER_MS + 1)), now)).toBe('none');
  });

  it('löscht beim zweiten Sichten nach mindestens 24 h', () => {
    expect(goneVerdict('gone', stored(iso(now - GONE_CONFIRM_AFTER_MS)), now)).toBe('delete');
    expect(goneVerdict('moved', stored(iso(now - 3 * 24 * HOUR)), now)).toBe('delete');
  });

  it('räumt die Marke, wenn die Seite wieder antwortet', () => {
    expect(goneVerdict('live', stored(iso(now - 2 * HOUR)), now)).toBe('clear');
    expect(goneVerdict('live', stored(null), now)).toBe('none');
  });

  it('lässt bei vorübergehenden Fehlern alles, wie es ist', () => {
    expect(goneVerdict('transient', stored(null), now)).toBe('none');
    expect(goneVerdict('transient', stored(iso(now - 5 * 24 * HOUR)), now)).toBe('none');
  });

  it('tut nichts ohne gespeicherte Punkte', () => {
    expect(goneVerdict('gone', null, now)).toBe('none');
  });

  it('behandelt eine unlesbare Marke wie keine Marke — markiert neu statt zu löschen', () => {
    expect(goneVerdict('gone', stored('kaputt'), now)).toBe('mark');
  });
});
