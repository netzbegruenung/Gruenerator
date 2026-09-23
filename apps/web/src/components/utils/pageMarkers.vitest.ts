import { describe, expect, it } from 'vitest';

import { stripMarkdownForPreview, stripPageMarkerLines } from './documentOverviewUtils';

const MARKED = '## Seite 1\n\nPräambel des Antrags.\n\n## Seite 2\n\nBeschluss A1.';

describe('Seitenmarken aus der Ingest-Pipeline', () => {
  it('stehen weder in der Kartenvorschau noch im Volltext', () => {
    expect(stripMarkdownForPreview(MARKED)).not.toMatch(/Seite \d/);
    expect(stripPageMarkerLines(MARKED)).toBe('Präambel des Antrags.\n\nBeschluss A1.');
  });

  it('lassen echte Überschriften und Text mit „Seite" stehen', () => {
    const text = '## Seitenwechsel\n\nAuf Seite 3 steht es.';
    expect(stripPageMarkerLines(text)).toBe(text);
  });
});
