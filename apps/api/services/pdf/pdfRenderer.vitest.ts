import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { type PdfDocumentSpec } from './pdfDocument.js';
import { renderPdf } from './pdfRenderer.js';
import { verifyPdf } from './pdfVerification.js';

function spec(overrides: Partial<PdfDocumentSpec> = {}): PdfDocumentSpec {
  return {
    title: 'Testdokument',
    kind: 'document',
    language: 'de-DE',
    blocks: [{ type: 'paragraph', text: 'Ein Absatz.' }],
    ...overrides,
  };
}

const RICH_BLOCKS: PdfDocumentSpec['blocks'] = [
  { type: 'heading', level: 2, text: 'Abschnitt' },
  { type: 'paragraph', text: 'Ein **fetter** Absatz mit *Betonung*.' },
  { type: 'list', items: ['Punkt eins', 'Punkt zwei'] },
  { type: 'list', ordered: true, items: ['Erstens', 'Zweitens'] },
  {
    type: 'table',
    columns: ['Jahr', 'Wert'],
    rows: [
      ['2025', '12'],
      ['2026', '18'],
    ],
  },
  { type: 'keyvalue', entries: [{ label: 'Datum', value: '01.03.2026' }] },
  { type: 'quote', text: 'Zitatzeile', source: 'Quelle' },
  { type: 'note', title: 'Hinweis', text: 'Kasten-Text' },
  { type: 'divider' },
  { type: 'signature', labels: ['Ort, Datum', 'Unterschrift'] },
];

describe('renderPdf', () => {
  it.each(['de-DE', 'de-AT'] as const)('renders every block type (%s)', async (locale) => {
    const result = await renderPdf(spec({ blocks: RICH_BLOCKS }), { locale });
    expect(result.bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const verification = await verifyPdf(result.bytes);
    expect(verification.problems).toEqual([]);
    expect(verification.extractedChars).toBeGreaterThan(50);
  });

  it('produces a tagged document with language, title and viewer title preference', async () => {
    const result = await renderPdf(spec({ blocks: RICH_BLOCKS }), { locale: 'de-DE' });
    const verification = await verifyPdf(result.bytes);

    expect(verification.hasStructureTree).toBe(true);
    expect(verification.isMarkedTagged).toBe(true);
    expect(verification.hasLanguage).toBe(true);
    expect(verification.hasTitle).toBe(true);
    expect(verification.showsTitleInViewer).toBe(true);
    expect(result.checks.taggedContent).toBe(true);
  });

  it('links every page into the structure tree via a parent tree', async () => {
    const result = await renderPdf(
      spec({ blocks: [{ type: 'heading', level: 2, text: 'Sichtbare Überschrift' }] }),
      { locale: 'de-DE' }
    );
    const doc = await PDFDocument.load(result.bytes);
    const structRoot = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
    expect(structRoot).toBeDefined();
    expect(structRoot?.get(PDFName.of('ParentTree'))).toBeDefined();

    for (const page of doc.getPages()) {
      expect(page.node.get(PDFName.of('StructParents'))).toBeDefined();
      // Tab order must follow the structure, not the creation order.
      expect(String(page.node.get(PDFName.of('Tabs')))).toBe('/S');
    }
  });

  it('exposes semantic roles a reader can navigate', async () => {
    const result = await renderPdf(spec({ blocks: RICH_BLOCKS }), { locale: 'de-DE' });

    // pdfjs walks the tree the way assistive tech does — a stronger check than
    // re-reading our own objects with pdf-lib.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(result.bytes),
      isEvalSupported: false,
    });
    const doc = await task.promise;
    const tree = await (await doc.getPage(1)).getStructTree();

    const roles: string[] = [];
    const walk = (node: { role?: string; children?: unknown[] } | null): void => {
      if (!node) return;
      if (node.role) roles.push(node.role);
      for (const child of node.children ?? []) {
        walk(child as { role?: string; children?: unknown[] });
      }
    };
    walk(tree as { role?: string; children?: unknown[] } | null);
    await task.destroy();

    expect(roles).toContain('Document');
    expect(roles).toContain('H2');
    expect(roles).toContain('L');
    expect(roles).toContain('LBody');
    expect(roles).toContain('Table');
    expect(roles).toContain('TH');
    expect(roles).toContain('TD');
  });

  it('creates real, labelled AcroForm fields for a form', async () => {
    const result = await renderPdf(
      spec({
        kind: 'form',
        title: 'Mitgliedsantrag',
        blocks: [
          { type: 'field', kind: 'text', label: 'Vorname', width: 'half', required: true },
          { type: 'field', kind: 'text', label: 'Nachname', width: 'half' },
          { type: 'field', kind: 'date', label: 'Geburtsdatum' },
          { type: 'field', kind: 'multiline', label: 'Anmerkungen', rows: 3 },
          { type: 'field', kind: 'checkbox', label: 'Ich stimme zu' },
          { type: 'field', kind: 'radio', label: 'Mitgliedsart', options: ['Voll', 'Förder'] },
          { type: 'field', kind: 'select', label: 'Gliederung', options: ['KV A', 'KV B'] },
        ],
      }),
      { locale: 'de-DE' }
    );

    expect(result.fields).toEqual([
      'vorname',
      'nachname',
      'geburtsdatum',
      'anmerkungen',
      'ich_stimme_zu',
      'mitgliedsart',
      'gliederung',
    ]);

    const verification = await verifyPdf(result.bytes);
    expect(verification.formFields.sort()).toEqual([...result.fields].sort());
    expect(verification.fieldsWithoutLabel).toEqual([]);
    expect(verification.problems).toEqual([]);
  });

  it('gives colliding field labels unique names instead of merging them', async () => {
    const result = await renderPdf(
      spec({
        kind: 'form',
        blocks: [
          { type: 'field', kind: 'text', label: 'Straße' },
          { type: 'field', kind: 'text', label: 'Straße' },
        ],
      }),
      { locale: 'de-DE' }
    );
    expect(result.fields).toEqual(['strasse', 'strasse_2']);
  });

  it('paginates long content instead of overflowing', async () => {
    const blocks: PdfDocumentSpec['blocks'] = Array.from({ length: 60 }, (_, i) => ({
      type: 'paragraph' as const,
      text: `Absatz ${i + 1}: ${'Text '.repeat(30)}`,
    }));
    const result = await renderPdf(spec({ blocks }), { locale: 'de-DE' });
    const verification = await verifyPdf(result.bytes);
    expect(verification.pages).toBeGreaterThan(1);
    // Structure must survive the page breaks, not just page 1.
    expect(verification.problems).toEqual([]);
  });

  it('renders a letter with recipient, subject and signature', async () => {
    const result = await renderPdf(
      spec({
        kind: 'letter',
        title: 'Brief',
        letter: {
          recipient: 'Testperson\nTeststraße 1\n12345 Teststadt',
          subject: 'Testbetreff',
          salutation: 'Sehr geehrte*r Test,',
          closing: 'Mit freundlichen Grüßen',
          signature: 'Maxi Mustermensch',
        },
        blocks: [{ type: 'paragraph', text: 'Brieftext.' }],
      }),
      { locale: 'de-DE', sender: { name: 'Maxi Mustermensch', organization: 'KV Test' } }
    );
    const verification = await verifyPdf(result.bytes);
    expect(verification.problems).toEqual([]);
    expect(verification.extractedChars).toBeGreaterThan(50);
  });
});
