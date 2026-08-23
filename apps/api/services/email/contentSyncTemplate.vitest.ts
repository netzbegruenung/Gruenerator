/**
 * Der Auslese-Block ist der einzige Ort im Bericht, an dem sichtbar wird, ob
 * die Fingerprint-Gatter greifen. Festgehalten:
 *   1. Die Zahlen stehen in HTML *und* Text — der Text-Teil wird gern vergessen
 *      und ist die Fassung, die viele Clients zeigen.
 *   2. Ohne Zähler (in-process-Läufe, ältere Teilberichte) fällt der Block
 *      ersatzlos weg, statt Nullen zu behaupten.
 */
import { describe, it, expect } from 'vitest';

import { renderContentSyncTemplate } from './templates.js';

const BASE = {
  timestamp: '2026-08-23T02:00:00.000Z',
  totalDuration: 812,
  sources: [
    {
      name: 'Landesverbaende',
      status: 'success' as const,
      stored: 2,
      updated: 1,
      skipped: 40,
      errors: 0,
      duration: 800,
    },
  ],
  totals: {
    sources: 1,
    succeeded: 1,
    failed: 0,
    stored: 2,
    updated: 1,
    skipped: 40,
    errors: 0,
  },
  dryRun: false,
};

const EXTRACTION = {
  documents: 3,
  pages: 97,
  ocrDocuments: 1,
  ocrPages: 52,
  redundant: 1,
  skipped: { not_modified: 12, same_bytes: 25, freshly_indexed: 8 },
};

describe('renderContentSyncTemplate — Auslese-Block', () => {
  it('shows what was read and what the gates kept out, in HTML', () => {
    const { html } = renderContentSyncTemplate({ ...BASE, extraction: EXTRACTION });

    expect(html).toContain('Dokumente ausgelesen');
    expect(html).toContain('3 (97 Seiten)');
    expect(html).toContain('1 (52 Seiten)');
    // Summe der drei Gatter, nicht eine einzelne Zahl.
    expect(html).toContain('>45<');
    expect(html).toContain('gleiche Bytes: 25');
  });

  it('repeats them in the plain-text part', () => {
    const { text } = renderContentSyncTemplate({ ...BASE, extraction: EXTRACTION });

    expect(text).toContain('Ausgelesen: 3 Dokumente / 97 Seiten (davon OCR: 1 / 52)');
    expect(text).toContain('Umsonst ausgelesen (Text unverändert): 1');
    expect(text).toContain('12 (304), 25 (gleiche Bytes), 8 (frisch)');
  });

  it('omits the block entirely when no counters were passed', () => {
    const { html, text } = renderContentSyncTemplate(BASE);

    expect(html).not.toContain('Dokumente ausgelesen');
    expect(text).not.toContain('Ausgelesen:');
    // Der Rest des Berichts bleibt vollständig.
    expect(text).toContain('Neue Dokumente: +2');
  });
});
