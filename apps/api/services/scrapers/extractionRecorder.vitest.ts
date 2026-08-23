/**
 * Die Zähler sind das Prüfmittel für die Fingerprint-Gatter — wenn sie falsch
 * zählen, meldet der Bericht eine Ersparnis, die es nicht gibt. Festgehalten:
 *   1. Der OCR-Anteil wird an "ocr" im Methodennamen erkannt, damit ein neuer
 *      Anbieter-Label nicht still aus der Kostenzahl fällt.
 *   2. Drain leert wirklich — im langlebigen API-Prozess trüge ein Rest die
 *      Zahlen des einen Laufs in den Bericht des nächsten.
 *   3. Das Zusammenführen der Matrix-Teilberichte verliert nichts und verträgt
 *      Teilberichte ohne das Feld.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  drainExtractionStats,
  mergeExtractionStats,
  recordExtraction,
  recordExtractionSkip,
  recordRedundantExtraction,
} from './extractionRecorder.js';

beforeEach(() => {
  drainExtractionStats();
});

describe('recordExtraction', () => {
  it('counts every read, and the OCR ones separately', () => {
    recordExtraction({ method: 'pdfjs-direct', pages: 12 });
    recordExtraction({ method: 'mistral-ocr', pages: 40 });

    const stats = drainExtractionStats();
    expect(stats).toMatchObject({
      documents: 2,
      pages: 52,
      ocrDocuments: 1,
      ocrPages: 40,
    });
  });

  it('recognises the paid path by the label, not by an allow-list', () => {
    recordExtraction({ method: 'some-future-OCR-provider', pages: 3 });
    expect(drainExtractionStats().ocrDocuments).toBe(1);
  });

  it('survives a missing page count', () => {
    recordExtraction({ method: 'plain-read', pages: undefined });
    const stats = drainExtractionStats();
    expect(stats.documents).toBe(1);
    expect(stats.pages).toBe(0);
  });
});

describe('drainExtractionStats', () => {
  it('resets, so one run never leaks into the next report', () => {
    recordExtraction({ method: 'mistral-ocr', pages: 5 });
    recordRedundantExtraction();
    recordExtractionSkip('same_bytes');
    drainExtractionStats();

    expect(drainExtractionStats()).toEqual({
      documents: 0,
      pages: 0,
      ocrDocuments: 0,
      ocrPages: 0,
      redundant: 0,
      skipped: { not_modified: 0, same_bytes: 0, freshly_indexed: 0 },
    });
  });

  it('keeps the gates apart', () => {
    recordExtractionSkip('not_modified');
    recordExtractionSkip('same_bytes');
    recordExtractionSkip('same_bytes');
    recordExtractionSkip('freshly_indexed');

    expect(drainExtractionStats().skipped).toEqual({
      not_modified: 1,
      same_bytes: 2,
      freshly_indexed: 1,
    });
  });
});

describe('mergeExtractionStats', () => {
  it('sums the matrix jobs and tolerates partials without the field', () => {
    recordExtraction({ method: 'mistral-ocr', pages: 10 });
    recordExtractionSkip('same_bytes');
    const a = drainExtractionStats();

    recordExtraction({ method: 'pdfjs-direct', pages: 4 });
    recordRedundantExtraction();
    recordExtractionSkip('same_bytes');
    recordExtractionSkip('not_modified');
    const b = drainExtractionStats();

    expect(mergeExtractionStats([a, undefined, b])).toEqual({
      documents: 2,
      pages: 14,
      ocrDocuments: 1,
      ocrPages: 10,
      redundant: 1,
      skipped: { not_modified: 1, same_bytes: 2, freshly_indexed: 0 },
    });
  });

  it('returns zeros when no partial carries the field', () => {
    expect(mergeExtractionStats([undefined, undefined]).documents).toBe(0);
  });
});
