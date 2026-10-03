import { describe, expect, it, vi, beforeEach } from 'vitest';

// The three collaborators are mocked so the test asserts ROUTING (which
// parliament, which sources) without touching PolitPro, Qdrant or Postgres.
const getPolitProPolls = vi.fn();
const lookupMeinungsbildByTopic = vi.fn();
const findStateElection = vi.fn();

vi.mock('./PolitProService.js', async () => {
  const actual =
    await vi.importActual<typeof import('./PolitProService.js')>('./PolitProService.js');
  return {
    ...actual,
    getPolitProPolls: (...args: unknown[]) => getPolitProPolls(...args),
  };
});
vi.mock('./MeinungsbildService.js', () => ({
  lookupMeinungsbildByTopic: (...args: unknown[]) => lookupMeinungsbildByTopic(...args),
}));
vi.mock('./StateElectionsService.js', () => ({
  findStateElection: (...args: unknown[]) => findStateElection(...args),
}));

const { lookupUmfragen } = await import('./UmfragenService.js');
const { nationalParliament, resolveParliamentByName } = await import('./PolitProService.js');

const POLLS = { average: { Grüne: 12.3, SPÖ: 21 }, polls: [{ date: '2026-07-20' }, {}] };

beforeEach(() => {
  vi.clearAllMocks();
  getPolitProPolls.mockResolvedValue(POLLS);
  lookupMeinungsbildByTopic.mockResolvedValue('Meinungsbild: 60% dafür');
  findStateElection.mockResolvedValue(null);
});

describe('nationalParliament', () => {
  it('gives Austria the Nationalrat, not the Bundestag', () => {
    expect(nationalParliament('AT')).toEqual({
      id: 'oesterreich',
      scope: 'Österreich (Nationalrat)',
    });
    expect(nationalParliament('DE')).toEqual({
      id: 'deutschland',
      scope: 'Deutschland (Bundestag)',
    });
  });
});

describe('resolveParliamentByName', () => {
  it('resolves Austrian regions, with umlaut folding', () => {
    expect(resolveParliamentByName('Wien', 'AT')?.id).toBe('wien');
    expect(resolveParliamentByName('kaernten', 'AT')?.id).toBe('kaernten');
    expect(resolveParliamentByName('Kärnten', 'AT')?.id).toBe('kaernten');
  });

  it('resolves a region named inside a sentence', () => {
    expect(resolveParliamentByName('Sonntagsfrage Steiermark', 'AT')?.id).toBe('steiermark');
  });

  it('prefers the longest matching name, not the first in the list', () => {
    // "oesterreich" is a substring of both of these, and the NATIONAL entry
    // comes first in the registry — so matching in registry order answered a
    // question about Oberösterreich with the Nationalrat, confidently labelled.
    expect(resolveParliamentByName('Umfragen in Oberösterreich', 'AT')?.id).toBe('oberoesterreich');
    expect(resolveParliamentByName('Umfragen in Niederösterreich', 'AT')?.id).toBe(
      'niederoesterreich'
    );
    // The national entry still wins when it is what was actually named.
    expect(resolveParliamentByName('Österreich', 'AT')?.id).toBe('oesterreich');
  });

  it('never crosses the border', () => {
    // Bayern is a German parliament — asking for it in the Austrian list must
    // not resolve, or a locale mix-up would silently answer with foreign data.
    expect(resolveParliamentByName('Bayern', 'AT')).toBeNull();
    expect(resolveParliamentByName('Wien', 'DE')).toBeNull();
    // The national entries must not resolve for the other country either.
    expect(resolveParliamentByName('Deutschland', 'AT')).toBeNull();
  });

  it('returns null for an unknown region instead of guessing', () => {
    expect(resolveParliamentByName('Atlantis', 'AT')).toBeNull();
    expect(resolveParliamentByName('', 'AT')).toBeNull();
  });
});

describe('lookupUmfragen — locale routing', () => {
  it('de-AT without a region asks the Nationalrat', async () => {
    const out = await lookupUmfragen('', undefined, 'de-AT');
    expect(getPolitProPolls).toHaveBeenCalledWith('oesterreich');
    expect(out).toContain('Österreich (Nationalrat)');
    expect(out).not.toContain('Bundestag');
  });

  it('de-AT with a region asks that Land', async () => {
    await lookupUmfragen('', 'Wien', 'de-AT');
    expect(getPolitProPolls).toHaveBeenCalledWith('wien');
    // The German election table is not consulted for Austrian turns.
    expect(findStateElection).not.toHaveBeenCalled();
  });

  it('de-DE resolves a named Land without the GERDA table', async () => {
    await lookupUmfragen('', undefined, 'de-DE');
    expect(getPolitProPolls).toHaveBeenCalledWith('deutschland');

    // findStateElection stays null, as it does with an unseeded table on prod.
    const out = await lookupUmfragen('', 'Bayern', 'de-DE');
    expect(getPolitProPolls).toHaveBeenLastCalledWith('bayern');
    expect(out).toContain('Sonntagsfrage Bayern');
    expect(out).not.toContain('Bundestag');
  });

  it('de-DE still resolves short codes through the state-election lookup', async () => {
    findStateElection.mockResolvedValue({ politProId: 'nordrhein-westfalen', stateName: 'NRW' });
    await lookupUmfragen('', 'NRW', 'de-DE');
    expect(findStateElection).toHaveBeenCalledWith('NRW');
    expect(getPolitProPolls).toHaveBeenCalledWith('nordrhein-westfalen');
  });

  it('says so when a named region resolves nowhere', async () => {
    const out = await lookupUmfragen('', 'Atlantis', 'de-DE');
    expect(getPolitProPolls).toHaveBeenCalledWith('deutschland');
    expect(out).toContain('Für „Atlantis“ gibt es keine eigene Sonntagsfrage');
    expect(out).toContain('Deutschland (Bundestag)');
  });

  it('keeps the national label when the country itself is named', async () => {
    const out = await lookupUmfragen('', 'Deutschland', 'de-DE');
    expect(out).toContain('Sonntagsfrage Deutschland (Bundestag)');
    expect(out).not.toContain('keine eigene');
  });

  it('defaults to de-DE so Monitor callers are unaffected', async () => {
    await lookupUmfragen('Klimaschutz');
    expect(getPolitProPolls).toHaveBeenCalledWith('deutschland');
    expect(lookupMeinungsbildByTopic).toHaveBeenCalledWith('Klimaschutz');
  });
});

describe('lookupUmfragen — sources', () => {
  it('never runs or cites GERDA for de-AT', async () => {
    const out = await lookupUmfragen('Klimaschutz', undefined, 'de-AT');
    // GERDA is German survey data with no Austrian counterpart: not queried…
    expect(lookupMeinungsbildByTopic).not.toHaveBeenCalled();
    // …and therefore not credited.
    expect(out).not.toContain('GERDA');
    expect(out).toContain('Quellen: Sonntagsfrage via PolitPro.');
  });

  it('cites GERDA only when a Meinungsbild block is actually present', async () => {
    const withTopic = await lookupUmfragen('Klimaschutz', undefined, 'de-DE');
    expect(withTopic).toContain('GERDA');

    lookupMeinungsbildByTopic.mockResolvedValue(null);
    const noMatch = await lookupUmfragen('Nichtssagendes Thema', undefined, 'de-DE');
    expect(noMatch).not.toContain('GERDA');
  });

  it('returns null when neither source yields anything', async () => {
    getPolitProPolls.mockResolvedValue(null);
    lookupMeinungsbildByTopic.mockResolvedValue(null);
    expect(await lookupUmfragen('x', undefined, 'de-AT')).toBeNull();
  });
});
