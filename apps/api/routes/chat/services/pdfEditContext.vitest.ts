import { describe, it, expect } from 'vitest';

import { buildPdfEditBrief } from './pdfEditContext.js';

import type { PdfDocumentSpec } from '../../../services/pdf/pdfDocument.js';

const spec = {
  kind: 'document',
  title: 'Stadtgrün-Aktionstag',
  blocks: [
    { type: 'heading', level: 2, text: 'Ziel' },
    { type: 'paragraph', text: 'Erreichen der angestrebten 80 Teilnehmenden.' },
  ],
} as unknown as PdfDocumentSpec;

describe('buildPdfEditBrief', () => {
  it('carries the previous document in verbatim so unrelated blocks survive', () => {
    const brief = buildPdfEditBrief(spec, 'Ändere das Ziel auf 100 Teilnehmende.');

    expect(brief).toContain(JSON.stringify(spec));
    expect(brief).toContain('Ändere das Ziel auf 100 Teilnehmende.');
  });

  it('orders a full re-emission — a summarised rewrite is the failure mode', () => {
    const brief = buildPdfEditBrief(spec, 'kürze die Einleitung');

    expect(brief).toMatch(/VOLLSTÄNDIGE Dokument erneut aus/);
    expect(brief).toMatch(/unverändert und wörtlich/);
  });
});
