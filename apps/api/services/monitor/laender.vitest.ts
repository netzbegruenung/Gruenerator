import { describe, expect, it } from 'vitest';

import { isSport, landesverbandCodesOf, landsOf, MONITOR_LAENDER } from './laender.js';
import { KNOWN_NEWS_SITEMAPS, KNOWN_RSS_FEEDS } from './rssFeeds.js';

const tag = (title: string, excerpt = '', feedKey: string | null = null) =>
  landsOf({ title, excerpt }, feedKey);

// Headlines from the live probe of 25.11.2026 unless noted.
describe('landsOf — headlines', () => {
  it.each([
    ['Haushaltswoche in NRW: „Schulden dürfen kein Wanderpokal sein"', ['nordrhein-westfalen']],
    ['Grüne in NRW schicken Sönke Wortmann zur Aigner-Wahl', ['nordrhein-westfalen']],
    ['Schüsse auf Polizist in Dortmund: Prozess hat begonnen', ['nordrhein-westfalen']],
    ['Crack-Krise im Bahnhofsviertel: Was Frankfurt von Zürich lernen kann', ['hessen']],
    ['Wilke-Prozess in Kassel: Wurden alle Angehörigen informiert?', ['hessen']],
    ['FDP will Hessenfonds schließen und Sozialticket abschaffen', []],
    ['Misstrauensantrag gegen steirische Landesregierung geht ins Leere', ['steiermark']],
    ['Kampfmesser im Schulrucksack: Mutmaßliche IS-Fans in Leoben vor Gericht', ['steiermark']],
  ])('%s', (title, lands) => {
    expect(tag(title)).toEqual(lands);
  });

  it('does not read Frankfurt (Oder) as Hessen', () => {
    expect(tag('Grenzbrücke in Frankfurt (Oder) wieder offen')).toEqual([]);
  });

  it('counts a word-like city only after a place preposition or as a dateline', () => {
    expect(tag('Gesundes Essen für Kitas: Bund will Standards')).toEqual([]);
    expect(tag('Messerangriff in Essen: Mann schwer verletzt')).toEqual(['nordrhein-westfalen']);
    expect(tag('Essen: Stadt sperrt Brücke')).toEqual(['nordrhein-westfalen']);
    expect(tag('Essener Stadtrat beschließt Haushalt')).toEqual(['nordrhein-westfalen']);
    expect(tag('Wer soll diese Wahl siegen?')).toEqual([]);
  });

  it('keeps cathedrals and people with a city name out', () => {
    expect(tag('Freiburger Münster wird für zwei Jahre eingerüstet')).toEqual([]);
    expect(tag('Nina Hagen feiert Geburtstag')).toEqual([]);
    expect(tag('Neue Radwege in Münster')).toEqual(['nordrhein-westfalen']);
  });

  it('can tag several Länder at once', () => {
    expect(tag('Zugverkehr zwischen Köln und Frankfurt eingeschränkt')).toEqual([
      'hessen',
      'nordrhein-westfalen',
    ]);
  });
});

describe('landsOf — excerpt and source', () => {
  it('trusts only the Land name in an excerpt, not its cities', () => {
    expect(tag('Bund plant neues Gesetz', 'Auch in Frankfurt wurde demonstriert.')).toEqual([]);
    expect(tag('Bund plant neues Gesetz', 'Hessen will im Bundesrat zustimmen.')).toEqual([
      'hessen',
    ]);
  });

  it('attributes every item of a Landes-Rubrik to its Land', () => {
    expect(tag('Winter meldet sich an', '', 'hessenschau.de')).toEqual(['hessen']);
    expect(tag('Theater im Bahnhof', '', 'kleinezeitung.at/steiermark')).toEqual(['steiermark']);
    // The publisher's world feeds are not Land sections.
    expect(tag('Munitionswerk in Iowa', '', 'hna.de')).toEqual([]);
  });

  it('only names Rubriken that are configured feeds', () => {
    const feeds = new Set([...Object.keys(KNOWN_RSS_FEEDS), ...Object.keys(KNOWN_NEWS_SITEMAPS)]);
    for (const key of [
      'hessenschau.de',
      'hna.de/hessen',
      'fr.de/rhein-main',
      'wdr.de',
      'ksta.de',
      'rp-online.de',
      'kleinezeitung.at/steiermark',
    ]) {
      expect(feeds.has(key), key).toBe(true);
      expect(tag('x', '', key)).toHaveLength(1);
    }
  });
});

describe('isSport', () => {
  it('flags sport headlines that carry a Land', () => {
    expect(isSport('Eintracht Frankfurt: Hohe Strafen nach Ausschreitungen')).toBe(true);
    expect(isSport('Dortmund ringt Arsenal ein 1:1 ab')).toBe(true);
    expect(isSport('Haushaltswoche in NRW')).toBe(false);
  });
});

describe('landesverbandCodesOf', () => {
  it('takes party and faction codes from LANDESVERBAENDE', () => {
    expect(landesverbandCodesOf('hessen')).toEqual(['HE', 'HE-F']);
    expect(landesverbandCodesOf('nordrhein-westfalen')).toEqual(['NRW', 'NRW-F']);
  });

  it('has none for Austrian Länder', () => {
    expect(landesverbandCodesOf('steiermark')).toBeNull();
  });

  it('covers every Land of the contract enum', () => {
    expect(MONITOR_LAENDER).toEqual(['hessen', 'nordrhein-westfalen', 'steiermark']);
  });
});
