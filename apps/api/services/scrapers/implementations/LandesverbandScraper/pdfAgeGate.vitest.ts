/**
 * Guards the PDF branch's third gate (#3576): a PDF that DocumentProcessor
 * already rejected as too_old must not be downloaded and OCRed again on every
 * run. Own module so the partitioning rule can be tested without loading the
 * scraper — see resultSamples.vitest.ts for the same reasoning.
 */
import { describe, expect, it } from 'vitest';

import { partitionPdfLinksByAge, type DatedPdfLink } from './pdfAgeGate.js';

function pdf(url: string, isTooOld: boolean | null): DatedPdfLink {
  return {
    url,
    title: 'Beschluss',
    context: '',
    dateInfo: { date: null, dateString: null, isTooOld },
  };
}

describe('partitionPdfLinksByAge', () => {
  it('a remembered too_old URL is gated, even when this run would call it recent', () => {
    const link = pdf('https://gruene.example/a.pdf', false); // dateInfo says "recent"
    const rejectedUrls = new Map([['https://gruene.example/a.pdf', '2019-01-01T00:00:00.000Z']]);

    const { gated, candidates } = partitionPdfLinksByAge([link], rejectedUrls, 5);

    expect(gated).toEqual([link]);
    expect(candidates).toEqual([]);
  });

  it('a remembered rejection that is no longer too old under a widened maxAgeYears is not gated', () => {
    const link = pdf('https://gruene.example/a.pdf', false);
    const rejectedUrls = new Map([['https://gruene.example/a.pdf', '2019-01-01T00:00:00.000Z']]);

    const { gated, candidates } = partitionPdfLinksByAge([link], rejectedUrls, 10);

    expect(gated).toEqual([]);
    expect(candidates).toEqual([link]);
  });

  it('sorts a freshly too-old PDF (not remembered) into tooOld', () => {
    const link = pdf('https://gruene.example/b.pdf', true);

    const { tooOld, candidates, gated } = partitionPdfLinksByAge([link], new Map(), 5);

    expect(tooOld).toEqual([link]);
    expect(candidates).toEqual([]);
    expect(gated).toEqual([]);
  });

  it('sorts an undated PDF into undated', () => {
    const link = pdf('https://gruene.example/c.pdf', null);

    const { undated, candidates } = partitionPdfLinksByAge([link], new Map(), 5);

    expect(undated).toEqual([link]);
    expect(candidates).toEqual([]);
  });

  it('sorts a recent, unremembered PDF into candidates', () => {
    const link = pdf('https://gruene.example/d.pdf', false);

    const { candidates, gated, tooOld, undated } = partitionPdfLinksByAge([link], new Map(), 5);

    expect(candidates).toEqual([link]);
    expect(gated).toEqual([]);
    expect(tooOld).toEqual([]);
    expect(undated).toEqual([]);
  });
});
