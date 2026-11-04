import { describe, expect, it } from 'vitest';

import { citedNumbers, docNumbers, judge, summarize } from './runLandtagEval.js';

const turn = (over: Partial<Parameters<typeof judge>[1]> = {}): Parameters<typeof judge>[1] => ({
  calls: [{ tool: 'landtag', args: { parlament: 'nrw' } }],
  resultText: 'Ref: NW 18/2141 … NRW-Drs. 18/616',
  answer: 'Der Antrag [Windenergie](quelle:1) vom 13.12.2022.',
  citations: [{ id: 1, title: 'NRW-Drs. 18/2141 · Antrag' }],
  error: null,
  seconds: 1,
  ...over,
});

describe('docNumbers / citedNumbers', () => {
  it('normalisiert Anfrage-S und führende Nullen', () => {
    expect(docNumbers('BE 19/S27244, 20/0004 und 18/2141')).toEqual([
      '19/27244',
      '20/4',
      '18/2141',
    ]);
  });

  it('liest die Protokollnummer aus einem kodierten Link', () => {
    expect(docNumbers('https://www.landtag.nrw.de/Dokument?Id=MMP18%2F129|1|20')).toEqual([
      '18/129',
    ]);
  });

  it('nimmt Nummern aus zitierten Quellen und aus dem Text, nicht aus unzitierten', () => {
    const cited = citedNumbers({
      answer: 'Siehe [2] und Drucksache 18/9',
      citations: [
        { id: 1, title: 'NRW-Drs. 18/1' },
        { id: 2, title: 'NRW-Drs. 18/2' },
      ],
    });
    expect(cited.sort()).toEqual(['18/2', '18/9']);
  });
});

describe('judge', () => {
  const base = { id: 'X', question: 'Frage', tools: [], truth: '' };

  it('besteht, wenn Aufruf, Zitat und Muster stimmen', () => {
    const r = judge(
      {
        ...base,
        tools: [{ tool: 'landtag', args: { parlament: 'nrw' } }],
        cites_all: ['18/2141'],
        must_contain: ['Wind'],
      },
      turn(),
      []
    );
    expect(r).toMatchObject({
      pass: true,
      severe: false,
      chain: 'landtag(nrw)',
      cited: ['18/2141'],
    });
  });

  it('meldet eine Nummer, die kein Werkzeug geliefert hat, als erfundene Ref (schwer)', () => {
    const r = judge(base, turn({ answer: 'Drucksache 18/99999 regelt das.' }), []);
    expect(r.severe).toBe(true);
    expect(r.failures).toEqual([expect.stringContaining('erfundene Ref: 18/99999')]);
  });

  it('zählt Nummern aus der registrierten Quellenliste als bekannt (Stream kürzt sources)', () => {
    const r = judge(
      base,
      turn({
        resultText: '',
        answer: 'Siehe [NRW-Drs. 18/4227](quelle:2).',
        citations: [{ id: 2, title: 'NRW-Drs. 18/4227 · Antwort' }],
      }),
      []
    );
    expect(r.severe).toBe(false);
  });

  it('zählt Nummern aus der Frage als bekannt', () => {
    const r = judge(
      { ...base, question: 'Was steht in 18/21208?' },
      turn({ answer: '18/21208 ändert …' }),
      []
    );
    expect(r.pass).toBe(true);
  });

  it('verlangt die Refs eines Leseaufrufs und meldet Verbotsmuster als schwer', () => {
    const r = judge(
      {
        ...base,
        tools: [{ tool: 'parlament_lesen', args: { quelle: 'nrw' }, refs: ['NW 18/21208'] }],
      },
      turn({ answer: 'Dokumente von Landtagen werden hier nicht durchsucht.' }),
      ['Dokumente von Landtagen (werden )?hier nicht']
    );
    expect(r.failures).toEqual([
      expect.stringContaining('fehlender Aufruf parlament_lesen'),
      expect.stringContaining('falsche Behauptung'),
    ]);
    expect(r.severe).toBe(true);
  });

  it('prüft Mindestzahl aus dem Wahrheits-Pool und beide Parlamente', () => {
    const r = judge(
      { ...base, cites_min: 2, cites_from: ['18/2141', '19/3451'], cites_both: true },
      turn(),
      []
    );
    expect(r.failures).toEqual([
      'zu wenig Treffer zitiert: 1 < 2',
      'nicht beide Parlamente zitiert',
    ]);
  });

  it('meldet einen verbotenen Aufruf, nicht aber einen anderen Parlaments-Aufruf', () => {
    const forbid = [{ tool: 'landtag', args: { parlament: 'nrw' } }];
    expect(judge({ ...base, forbid_tools: forbid }, turn(), []).failures).toEqual([
      'verbotener Aufruf landtag {"parlament":"nrw"}',
    ]);
    const other = turn({ calls: [{ tool: 'landtag', args: { parlament: 'nationalrat' } }] });
    expect(judge({ ...base, forbid_tools: forbid }, other, []).pass).toBe(true);
  });
});

describe('summarize', () => {
  const result = (pass: boolean, severe = false) => ({
    id: 'B1',
    pass,
    severe,
    chain: 'landtag(berlin)',
    cited: [],
    failures: pass ? [] : ['zu wenig Treffer zitiert: 0 < 3'],
    seconds: 10,
  });

  it('zählt je Fall die bestandenen Läufe und markiert schwere Fehlläufe', () => {
    const [ok, mixed] = summarize([
      { ...result(true), id: 'N1' },
      result(true),
      result(false, true),
      result(true),
    ]);
    expect(ok).toMatchObject({ id: 'N1', runs: 1, passRuns: 1 });
    expect(mixed).toMatchObject({ id: 'B1', runs: 3, passRuns: 2 });
    expect(mixed!.line).toMatch(/^B1 {3}FAIL! 2\/3 .*zu wenig Treffer/);
  });
});
