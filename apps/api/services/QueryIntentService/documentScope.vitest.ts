import { describe, expect, it } from 'vitest';

import { GRUNDSATZ_SOURCE } from '../scrapers/implementations/ProgramPdfScraper.js';

import { queryIntentService } from './index.js';

/**
 * Der Wächter über die Naht zwischen Frage und Korpus.
 *
 * `detectDocumentScope` grenzt eine programm-namentliche Frage auf EIN Dokument
 * der Sammlung `grundsatz_documents` ein. Der Filterwert entsteht hier, der
 * gefilterte Wert entsteht im Scraper — zwei Dateien, die übereinstimmen
 * müssen, ohne dass der Compiler das sieht. Genau dort ist es am 19.08.2026
 * auseinandergelaufen: der Filter setzte einen exakten `title`-Match mit
 * 'Grundsatzprogramm 2020', gespeichert ist
 * 'Grundsatzprogramm 2020 – Veränderung schafft Halt'. Live gegen Qdrant
 * nachgemessen: 0 von 968 Punkten getroffen, für alle drei Muster — jede
 * programm-namentliche Notebook-Frage lief in eine Geisterantwort.
 *
 * Deshalb prüft dieser Test den Filterwert NICHT gegen ein Literal, sondern
 * gegen die Werte, die der Scraper wirklich schreibt.
 */
describe('detectDocumentScope — Programm-Eingrenzung', () => {
  const scraperCategories = new Set(GRUNDSATZ_SOURCE.documents.map((d) => d.primaryCategory));

  const cases: ReadonlyArray<{ prompt: string; document: string }> = [
    {
      prompt: 'Was steht im Grundsatzprogramm zur sozialen Sicherung?',
      document: '20200125_Grundsatzprogramm',
    },
    {
      prompt: 'Was sagt das EU-Wahlprogramm zum Klimaschutz?',
      document: '20240306_Reader_EU-Wahlprogramm2024_A4',
    },
    {
      prompt: 'Welche Ziele nennt das Regierungsprogramm 2025?',
      document: '20250318_Regierungsprogramm_DIGITAL_DINA5',
    },
  ];

  for (const { prompt, document } of cases) {
    it(`grenzt "${prompt.slice(0, 32)}…" auf einen Wert ein, den der Scraper schreibt`, () => {
      const scope = queryIntentService.detectDocumentScope(prompt);
      const expected = GRUNDSATZ_SOURCE.documents.find(
        (d) => d.documentId === document
      )?.primaryCategory;

      expect(scope.collections).toEqual(['grundsatz-system']);
      expect(scope.documentCategoryFilter).toBe(expected);
      // Die eigentliche Zusicherung: der Wert existiert im Korpus.
      expect(scraperCategories.has(scope.documentCategoryFilter as string)).toBe(true);
    });
  }

  it('grenzt eine Frage nach "den Programmen" auf die Sammlung ein, aber auf kein Dokument', () => {
    const scope = queryIntentService.detectDocumentScope('Was steht in den Grundsatzprogrammen?');
    expect(scope.collections).toEqual(['grundsatz-system']);
    expect(scope.documentCategoryFilter).toBeNull();
  });

  it('lässt eine Frage ohne Programmnamen ungefiltert', () => {
    const scope = queryIntentService.detectDocumentScope('Wie steht ihr zur Vermögensteuer?');
    expect(scope.documentCategoryFilter).toBeNull();
    expect(scope.detectedPhrase).toBeNull();
  });
});
