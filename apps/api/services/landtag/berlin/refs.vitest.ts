import { describe, expect, it, vi } from 'vitest';

import { type PardokLister, type PardokParams } from './pardokLive.js';
import { parseBerlinRef, resolveBerlinRefs } from './refs.js';

import type { PardokRecord } from '../../scrapers/implementations/LandtagBerlinScraper/pardokClient.js';

const rec = (nr: string, typ: string, path: string, id: string): PardokRecord => ({
  dokumentnummer: [{ main: nr }],
  drucksachentyp: [{ main: typ }],
  id: [{ main: id }],
  titel: [{ main: '', t: `Titel ${nr}` }],
  wahlperiode: [{ main: '19' }],
  datum: '2026.01.02',
  pdf_url: [{ main: `https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/${path}` }],
});

function lister(documents: PardokRecord[]) {
  const calls: PardokParams[] = [];
  const impl: PardokLister = {
    list: vi.fn(async (_e, params) => {
      calls.push(params);
      return { numFound: documents.length, cursor: null, documents };
    }),
  };
  return { impl, calls };
}

describe('parseBerlinRef', () => {
  it('trennt Drucksache und Schriftliche Anfrage', () => {
    expect(parseBerlinRef('BE 19/3519')).toEqual({ wp: '19', nr: '3519', anfrage: false });
    expect(parseBerlinRef('BE 19/S27288')).toEqual({ wp: '19', nr: '27288', anfrage: true });
    expect(parseBerlinRef('21/1928')).toBeNull();
    expect(parseBerlinRef('BB 8/13')).toBeNull();
  });
});

describe('resolveBerlinRefs', () => {
  it('fragt je Wahlperiode einmal und schickt die Schreibweisen mit Nullen mit', async () => {
    const { impl, calls } = lister([
      rec('3519', 'Antrag', 'DruckSachen/d19-3519.pdf', 'D-1'),
      rec('27288', 'Antwort', 'SchrAnfr/S19-27288.pdf', 'D-3'),
      rec('27288', 'Schriftliche Anfrage', 'SchrAnfr/S19-27288.pdf', 'D-2'),
    ]);
    const out = await resolveBerlinRefs(['BE 19/3519', 'BE 19/S27288', 'BE 19/S99999'], impl);
    expect(calls).toHaveLength(1);
    expect(calls[0]!['f.wahlperiode']).toBe('19');
    expect(calls[0]!['f.dokumentnummer']).toEqual(
      expect.arrayContaining(['3519', '03519', '27288', '99999'])
    );
    expect(out.map((c) => c.ref)).toEqual(['BE 19/3519', 'BE 19/S27288']);
    // Anfrage und Antwort teilen den Ref: die Anfrage gewinnt.
    expect(out[1]!.drucksachetyp).toBe('Schriftliche Anfrage');
  });

  it('hält eine Drucksache von der Anfrage gleicher Nummer auseinander', async () => {
    const { impl } = lister([
      rec('2601', 'Antrag', 'DruckSachen/d19-2601.pdf', 'D-1'),
      rec('2601', 'Schriftliche Anfrage', 'SchrAnfr/S19-2601.pdf', 'D-2'),
    ]);
    const out = await resolveBerlinRefs(['BE 19/2601'], impl);
    expect(out).toHaveLength(1);
    expect(out[0]!.drucksachetyp).toBe('Antrag');
  });

  it('fragt nicht, wenn kein Ref zum Parlament gehört', async () => {
    const { impl } = lister([]);
    expect(await resolveBerlinRefs(['21/1928'], impl)).toEqual([]);
    expect(impl.list).not.toHaveBeenCalled();
  });
});
