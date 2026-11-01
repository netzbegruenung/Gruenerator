import { describe, expect, it, vi } from 'vitest';

import { type BundestagCandidate } from '@gruenerator/contracts';

import { fetchBerlinTexts } from './text.js';

const cand = (pdfUrl: string | null): BundestagCandidate => ({
  ref: 'BE 19/1',
  dipId: 'D-1',
  kind: 'drucksache',
  dokumentnummer: '19/1',
  drucksachetyp: 'Antrag',
  titel: 'T',
  datum: '2026-01-01',
  urheber: [],
  pdfUrl,
  vorgangId: null,
  vorgangTitel: null,
  abstract: null,
  aktualisiert: null,
  beratung: null,
});

describe('fetchBerlinTexts', () => {
  it('holt nichts von einem fremden Host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await fetchBerlinTexts(
      [cand('https://evil.example/d19-1.pdf'), cand('http://pardok.parlament-berlin.de/x.pdf')],
      { redis: null, signal: new AbortController().signal }
    );
    expect(out.map((d) => d.textSource)).toEqual(['missing', 'missing']);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('meldet ein Dokument ohne PDF als fehlend', async () => {
    const [d] = await fetchBerlinTexts([cand(null)], {
      redis: null,
      signal: new AbortController().signal,
    });
    expect(d).toMatchObject({ textSource: 'missing', text: '' });
  });

  it('liefert den gecachten Text ohne Abruf', async () => {
    const redis = {
      get: vi.fn(async () => JSON.stringify({ text: 'Inhalt', textSource: 'pdf' })),
      set: vi.fn(),
    };
    const [d] = await fetchBerlinTexts([cand(null)], {
      redis,
      signal: new AbortController().signal,
    });
    expect(d).toMatchObject({ text: 'Inhalt', textSource: 'pdf' });
  });
});
