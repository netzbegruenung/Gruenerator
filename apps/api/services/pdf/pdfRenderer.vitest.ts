import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';
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

/** Read the text layer the way a screen reader would. */
async function extractText(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ('str' in item) text += item.str;
  }
  await task.destroy();
  return text;
}

/** Structure roles of page 1, in reading order. */
async function structRoles(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
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
  return roles;
}

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

  it('declares PDF/UA-1 in an XMP metadata stream', async () => {
    const result = await renderPdf(spec({ blocks: RICH_BLOCKS }), { locale: 'de-DE' });
    const doc = await PDFDocument.load(result.bytes);
    const metadataRef = doc.catalog.get(PDFName.of('Metadata'));
    const metadata = metadataRef ? doc.context.lookup(metadataRef) : null;

    expect(metadata).toBeInstanceOf(PDFRawStream);
    const stream = metadata as PDFRawStream;
    const xmp = Buffer.from(stream.contents).toString('utf8');
    expect(xmp).toContain('pdfuaid:part');
    expect(xmp).toContain('Testdokument');
    // Must stay readable without decompression.
    expect(stream.dict.get(PDFName.of('Filter'))).toBeUndefined();

    const verification = await verifyPdf(result.bytes);
    expect(verification.hasUaIdentifier).toBe(true);
  });

  it('gives every Form element exactly one child — the widget reference', async () => {
    // PDF/UA-1 7.18.4: a Form without a Role attribute may only contain the
    // object reference. Label and hint must be siblings, not children.
    const result = await renderPdf(
      spec({
        kind: 'form',
        blocks: [
          { type: 'field', kind: 'text', label: 'Vorname', help: 'Wie im Ausweis' },
          { type: 'field', kind: 'radio', label: 'Art', options: ['A', 'B'] },
        ],
      }),
      { locale: 'de-DE' }
    );

    const doc = await PDFDocument.load(result.bytes);
    const forms: PDFDict[] = [];
    const visit = (node: unknown): void => {
      const resolvedNode = node instanceof PDFRef ? doc.context.lookup(node) : node;
      if (resolvedNode instanceof PDFArray) {
        resolvedNode.asArray().forEach(visit);
        return;
      }
      if (!(resolvedNode instanceof PDFDict)) return;
      if (String(resolvedNode.get(PDFName.of('S')) ?? '') === '/Form') forms.push(resolvedNode);
      const kids = resolvedNode.get(PDFName.of('K'));
      if (kids) visit(kids);
    };
    const structRoot = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
    visit(structRoot?.get(PDFName.of('K')));

    // One per widget: the text field plus both radio options.
    expect(forms).toHaveLength(3);
    for (const form of forms) {
      const kids = form.get(PDFName.of('K'));
      const resolved = kids instanceof PDFRef ? doc.context.lookup(kids) : kids;
      expect(resolved instanceof PDFArray ? resolved.size() : 1).toBe(1);
      expect(form.get(PDFName.of('Alt'))).toBeDefined();
    }
  });

  it('puts the accessible name on the field itself, not only on the widget', async () => {
    // A radio group's field and its option widgets are different dictionaries —
    // /TU on the widget alone leaves the group unnamed (PDF/UA-1 7.18.1).
    const result = await renderPdf(
      spec({
        kind: 'form',
        blocks: [{ type: 'field', kind: 'radio', label: 'Teilnahmeform', options: ['Vor Ort'] }],
      }),
      { locale: 'de-DE' }
    );
    const doc = await PDFDocument.load(result.bytes);
    const field = doc.getForm().getFields()[0];
    expect(field.acroField.dict.get(PDFName.of('TU'))).toBeDefined();
  });

  it('replaces characters the CI fonts lack instead of drawing .notdef boxes', async () => {
    // A .notdef glyph is forbidden outright by PDF/UA 7.21.8 and shows up as an
    // empty box; pdf-lib emits one silently, so coverage is checked up front.
    const result = await renderPdf(
      spec({
        blocks: [
          { type: 'paragraph', text: 'Antrag → Prüfung' },
          { type: 'list', items: ['✓ erledigt', '✗ offen'] },
        ],
      }),
      { locale: 'de-DE' }
    );
    const text = await extractText(result.bytes);
    expect(text).toContain('Antrag -> Prüfung');
    expect(text).toContain('x erledigt');
    expect(result.missingGlyphs).toEqual([]);
  });

  it('reports characters it had to drop entirely', async () => {
    const result = await renderPdf(spec({ blocks: [{ type: 'paragraph', text: 'Text 中文' }] }), {
      locale: 'de-DE',
    });
    expect(result.missingGlyphs.length).toBeGreaterThan(0);
  });

  it('keeps "ff" as two letters so the text stays extractable', async () => {
    // The heading font ligates "ff" into one glyph that pdf-lib maps neither to
    // a correct width nor back to Unicode — "Öffentlichkeitsarbeit" then breaks
    // PDF/UA 7.21.5 and 7.21.7.
    const result = await renderPdf(spec({ title: 'Öffentlichkeitsarbeit' }), { locale: 'de-DE' });
    expect(await extractText(result.bytes)).toContain('Öffentlichkeitsarbeit');
  });

  it('never skips a heading level, even when the model does', async () => {
    // The title is already an H1; a level-3 block right after it would jump a
    // level and break the outline (PDF/UA 7.4.2).
    const result = await renderPdf(
      spec({
        blocks: [
          { type: 'heading', level: 3, text: 'Erste Überschrift' },
          { type: 'heading', level: 3, text: 'Zweite Überschrift' },
        ],
      }),
      { locale: 'de-DE' }
    );
    const roles = await structRoles(result.bytes);
    expect(roles).toContain('H2');
    expect(roles.indexOf('H2')).toBeLessThan(roles.length);
  });

  it('folds surplus table cells into the last column instead of dropping them', async () => {
    const result = await renderPdf(
      spec({ blocks: [{ type: 'table', columns: ['A'], rows: [['behalten', 'ueberhang']] }] }),
      { locale: 'de-DE' }
    );
    const text = await extractText(result.bytes);
    expect(text).toContain('behalten');
    expect(text).toContain('ueberhang');
  });

  it('exposes semantic roles a reader can navigate', async () => {
    const result = await renderPdf(spec({ blocks: RICH_BLOCKS }), { locale: 'de-DE' });

    // pdfjs walks the tree the way assistive tech does — a stronger check than
    // re-reading our own objects with pdf-lib.
    const roles = await structRoles(result.bytes);

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
