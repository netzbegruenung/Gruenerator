import { describe, expect, it } from 'vitest';

import { prepareExtractedText } from './fileText';

// Line shapes taken from a real extraction (pdfjs, six-page Fraktionsbeschluss).
const COLUMN =
  'Es ist Zeit für eine neue Verkehrspolitik. Angesichts von Dieselgate, Luftverschmutzung und wachsender';

describe('prepareExtractedText', () => {
  it('joins the lines the layout broke and keeps sentence ends as breaks', () => {
    const raw = `${COLUMN}\nStadt können wir nicht so weiter machen.\nMit diesen Trends haben wir die Chance.`;
    expect(prepareExtractedText(raw)).toBe(
      `${COLUMN} Stadt können wir nicht so weiter machen.\nMit diesen Trends haben wir die Chance.`
    );
  });

  it('heals words split at the line end, including the kerned " -" form', () => {
    const raw = `${COLUMN} Verän-\nderungen und die Straßen-\nbahn sind automati -\nsiert. An den U-Bahn-\nhöfen.`;
    expect(prepareExtractedText(raw)).toBe(
      `${COLUMN} Veränderungen und die Straßenbahn sind automatisiert. An den U-Bahnhöfen.`
    );
  });

  it('keeps a real hyphen: before a capital, and before a conjunction', () => {
    const raw = `${COLUMN} Lastenrad oder Elektro-\nLKW, dazu Rad-\nund Fußverkehr.`;
    expect(prepareExtractedText(raw)).toBe(
      `${COLUMN} Lastenrad oder Elektro-LKW, dazu Rad- und Fußverkehr.`
    );
  });

  it('drops page numbers, also when a word is split across the page break', () => {
    const raw = `${COLUMN} Verän-\n2\n\nderungen entstanden.\n3\n`;
    expect(prepareExtractedText(raw)).toBe(`${COLUMN} Veränderungen entstanden.`);
  });

  it('strips extractor markdown but leaves the gender star alone', () => {
    const raw = `Beschluss der Fraktion Bündnis 90/Die Grünen im Abgeordnetenhaus, 1.9.2017 und so\n# MODERNE MOBILITÄT\n**Wichtig:** Berliner*innen ![img-0.jpeg](img-0.jpeg)fahren Rad.`;
    expect(prepareExtractedText(raw)).toBe(
      'Beschluss der Fraktion Bündnis 90/Die Grünen im Abgeordnetenhaus, 1.9.2017 und so\n\nMODERNE MOBILITÄT\n\nWichtig: Berliner*innen fahren Rad.'
    );
  });

  it('keeps a short heading on its own line instead of reading it into the next sentence', () => {
    const raw = `${COLUMN}\nverringern.\nGrün wirkt\nDamit es in Berlin weniger Unfälle gibt, haben wir die ersten Kreuzungen umgebaut und`;
    expect(prepareExtractedText(raw)).toBe(
      `${COLUMN} verringern.\nGrün wirkt\nDamit es in Berlin weniger Unfälle gibt, haben wir die ersten Kreuzungen umgebaut und`
    );
  });
});
