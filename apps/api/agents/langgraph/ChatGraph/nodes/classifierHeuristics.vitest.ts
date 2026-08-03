import { describe, it, expect } from 'vitest';

import { extractDomainScope } from './classifierHeuristics.js';

/**
 * extractDomainScope turns "such auf zeit.de und spiegel.de nach X" into
 * `includeDomains`/`excludeDomains` for Linkup. The load-bearing rule (4) is
 * that an unmarked or ambiguous mention returns nothing rather than guessing
 * — a scope that silently narrows every later search in the turn is worse
 * than no scope, so these tests lean on cases that could plausibly be
 * misread rather than only the clean positive cases.
 */
describe('extractDomainScope', () => {
  it('scopes a single domain named with an include preposition', () => {
    expect(
      extractDomainScope('Suche bitte auf zeit.de nach Neuigkeiten zur Klimapolitik.')
    ).toEqual({ include: ['zeit.de'], exclude: [] });
  });

  it('scopes both domains in an "und"-joined enumeration to the same polarity', () => {
    expect(extractDomainScope('Suche auf zeit.de und spiegel.de nach Klimapolitik.')).toEqual({
      include: ['zeit.de', 'spiegel.de'],
      exclude: [],
    });
  });

  it('scopes a comma-joined enumeration (no "und") to the same polarity', () => {
    expect(extractDomainScope('Suche auf zeit.de, spiegel.de nach Klimapolitik.')).toEqual({
      include: ['zeit.de', 'spiegel.de'],
      exclude: [],
    });
  });

  it('excludes a domain introduced with "nicht von"', () => {
    expect(extractDomainScope('Suche nach Klimapolitik, aber nicht von spiegel.de.')).toEqual({
      include: [],
      exclude: ['spiegel.de'],
    });
  });

  it('excludes a domain introduced with "ohne"', () => {
    expect(extractDomainScope('Suche nach Klimapolitik, ohne focus.de.')).toEqual({
      include: [],
      exclude: ['focus.de'],
    });
  });

  it('splits a mixed include/exclude sentence into both lists', () => {
    expect(
      extractDomainScope('Suche auf zeit.de, aber nicht von spiegel.de nach dem Artikel.')
    ).toEqual({ include: ['zeit.de'], exclude: ['spiegel.de'] });
  });

  it('returns nothing when the same domain is mentioned as both include and exclude (exclude wins)', () => {
    expect(extractDomainScope('Suche auf zeit.de, aber nicht von zeit.de zu Sportthemen.')).toEqual(
      { include: [], exclude: ['zeit.de'] }
    );
  });

  it('returns an empty scope when no search verb is present at all', () => {
    // The literal motivating example: "auf zeit.de" sits right next to the
    // domain, but the sentence reports on zeit.de rather than asking to
    // search it — there is no search verb anywhere to license the marker.
    expect(extractDomainScope('Die Zeit hat auf zeit.de berichtet, was hältst du davon?')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('returns an empty scope when a domain is mentioned with no marker in front of it', () => {
    expect(extractDomainScope('Suche Infos zur Klimapolitik. zeit.de wird oft zitiert.')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('drops a domain that also appears as a full URL in the same message', () => {
    // Full URL == "read this page" (scrape_url); bare domain == "scope the
    // search to this site". zeit.de stays scoped, spiegel.de is a scrape target.
    expect(
      extractDomainScope(
        'Suche auf zeit.de und lies auch https://spiegel.de/politik/artikel-123 durch.'
      )
    ).toEqual({ include: ['zeit.de'], exclude: [] });
  });

  it('strips a leading "www." prefix from the domain', () => {
    expect(extractDomainScope('Suche bei www.taz.de nach der Landtagswahl.')).toEqual({
      include: ['taz.de'],
      exclude: [],
    });
  });

  it('does not treat a file extension as a domain', () => {
    expect(extractDomainScope('Suche auf bericht.pdf nach dem Inhalt.')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('does not treat a version number or IP-shaped token as a domain', () => {
    expect(
      extractDomainScope('Suche auf 3.14 und 192.168.1.1 nach passenden Ergebnissen.')
    ).toEqual({ include: [], exclude: [] });
  });

  it('returns an empty scope for an empty string', () => {
    expect(extractDomainScope('')).toEqual({ include: [], exclude: [] });
  });

  it('returns an empty scope for a null-ish input without throwing', () => {
    expect(extractDomainScope(null as unknown as string)).toEqual({ include: [], exclude: [] });
    expect(extractDomainScope(undefined as unknown as string)).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('recognises Austrian domains (orf.at, derstandard.at)', () => {
    expect(
      extractDomainScope('Suche ausschliesslich auf orf.at und derstandard.at nach der Wahl.')
    ).toEqual({ include: ['orf.at', 'derstandard.at'], exclude: [] });
  });
});
