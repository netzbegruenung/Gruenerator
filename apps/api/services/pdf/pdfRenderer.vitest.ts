import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { type PdfDocumentSpec } from './pdfDocument.js';
import { PDF_TYPE_AREA, renderPdf } from './pdfRenderer.js';
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

/** Anzahl verschiedener Grundlinien auf Seite 1 — misst gesetzte Zeilen. */
async function baselineCount(bytes: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  const baselines = new Set<number>();
  for (const item of content.items) {
    if ('str' in item && item.str.trim())
      baselines.add(Math.round((item.transform as number[])[5]!));
  }
  await task.destroy();
  return baselines.size;
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

/** Count structure elements once over the whole document (not per page). */
async function countRoles(bytes: Buffer): Promise<Record<string, number>> {
  const doc = await PDFDocument.load(bytes);
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    const resolved = node instanceof PDFRef ? doc.context.lookup(node) : node;
    if (resolved instanceof PDFArray) {
      resolved.asArray().forEach(visit);
      return;
    }
    if (!(resolved instanceof PDFDict)) return;
    if (node instanceof PDFRef) {
      if (seen.has(node.toString())) return;
      seen.add(node.toString());
    }
    const role = String(resolved.get(PDFName.of('S')) ?? '');
    if (role) counts[role] = (counts[role] ?? 0) + 1;
    const kids = resolved.get(PDFName.of('K'));
    if (kids) visit(kids);
  };
  const root = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  visit(root?.get(PDFName.of('K')));
  return counts;
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

  describe('Layout-Robustheit', () => {
    // Every case here used to produce a visibly broken page while passing
    // PDF/UA — the validator sees structure, not geometry.
    const cases: Array<[string, PdfDocumentSpec]> = [
      [
        'überlanges Feld-Label neben einem zweiten Feld',
        spec({
          kind: 'form',
          blocks: [
            { type: 'field', kind: 'text', label: 'A'.repeat(150), width: 'half' },
            { type: 'field', kind: 'text', label: 'Zweites Feld', width: 'half' },
          ],
        }),
      ],
      [
        'überlange Signatur-Beschriftungen',
        spec({
          blocks: [
            {
              type: 'signature',
              labels: [
                'Ort, Datum und Unterschrift der antragstellenden Person',
                'Unterschrift Zeuge',
                'Stempel',
              ],
            },
          ],
        }),
      ],
      [
        'Hinweiskasten über mehrere Seiten',
        spec({ blocks: [{ type: 'note', title: 'Hinweis', text: 'Satz. '.repeat(1000) }] }),
      ],
      [
        'Tabellenzeile höher als eine Seite',
        spec({
          blocks: [
            {
              type: 'table',
              columns: ['A', 'B'],
              rows: [['x', 'Zellinhalt der sehr lang ist. '.repeat(400)]],
            },
          ],
        }),
      ],
      [
        'überlange Radio-Option',
        spec({
          kind: 'form',
          blocks: [
            {
              type: 'field',
              kind: 'radio',
              label: 'Einwilligung',
              options: [
                `Ja, ich moechte informiert werden ${'und zwar ausfuehrlich '.repeat(6)}`,
                'Nein',
              ],
            },
            { type: 'field', kind: 'text', label: 'Danach' },
          ],
        }),
      ],
      [
        'überlange Empfängerzeile im Brief',
        spec({
          kind: 'letter',
          letter: { recipient: `${'Sehr lange Empfängerzeile '.repeat(10)}\n12345 Ort` },
          blocks: [{ type: 'paragraph', text: 'Brieftext.' }],
        }),
      ],
    ];

    it.each(cases)('hält den Satzspiegel ein: %s', async (_name, input) => {
      const result = await renderPdf(input, { locale: 'de-DE' });
      const verification = await verifyPdf(result.bytes, PDF_TYPE_AREA);
      expect(verification.overflowingText).toEqual([]);
      expect(verification.problems).toEqual([]);
    });

    it('meldet Überlauf, wenn es welchen gibt (Kalibrierung)', async () => {
      // Guards the guard: with an artificially narrow type area the check MUST
      // fire, otherwise the assertions above would pass vacuously.
      const result = await renderPdf(
        spec({
          blocks: [
            { type: 'paragraph', text: 'Ein ganz normaler Absatz mit ausreichend Text darin.' },
          ],
        }),
        { locale: 'de-DE' }
      );
      const tight = await verifyPdf(result.bytes, { left: 70, right: 200, bottom: 40 });
      expect(tight.overflowingText.length).toBeGreaterThan(0);
    });

    it('opfert keine Datenzeile für die wiederholte Kopfzeile', async () => {
      // Eine Kopfzeile, die selbst fast eine Seite füllt, hat die Wiederholung
      // jede Folgeseite belegen lassen — die Datenzeilen fielen still weg.
      const columns = ['A', 'B', 'Kopfzelle '.repeat(77), 'D', 'E', 'F', 'G', 'H'];
      const cell = 'Inhalt der Zelle ist ziemlich lang und umbricht mehrfach. ';
      const rows = Array.from({ length: 10 }, (_, i) => [
        `Marke${i + 1}`,
        cell,
        cell,
        cell,
        cell,
        cell,
        cell,
        cell,
      ]);
      const result = await renderPdf(spec({ blocks: [{ type: 'table', columns, rows }] }), {
        locale: 'de-DE',
      });
      const counts = await countRoles(result.bytes);
      // Ohne Verlust: eine TR je Datenzeile plus Kopfzeile (Zeilen dürfen sich
      // über Seiten teilen, aber keine darf verschwinden).
      expect(counts['/TR'] ?? 0).toBeGreaterThanOrEqual(rows.length + 1);
    });

    it('zerreißt eine Zeile nicht, die auf die nächste Seite passen würde', async () => {
      const rows = Array.from({ length: 40 }, (_, i) => [
        `Nr ${i + 1}`,
        `Massnahme ${i + 1}: eine Beschreibung die ueber zwei Zeilen laeuft und lang genug ist`,
        '1000 EUR',
      ]);
      const result = await renderPdf(
        spec({ blocks: [{ type: 'table', columns: ['Nr', 'Massnahme', 'Kosten'], rows }] }),
        { locale: 'de-DE' }
      );
      const counts = await countRoles(result.bytes);
      expect(counts['/TR']).toBe(rows.length + 1);
      expect(counts['/TD']).toBe(rows.length * 3);
    });

    it('richtet die Datumszeile nach der wirklich gezeichneten Breite aus', async () => {
      // Der Ort geht durch die Glyphen-Ersetzung; nach dem Rohtext gemessen
      // stünde die rechtsbündige Zeile über dem rechten Rand.
      for (const place of ['Berlin → Mitte', 'Berlin 🌻 Mitte', 'Ort'.repeat(60)]) {
        const result = await renderPdf(
          spec({
            kind: 'letter',
            letter: { place, recipient: 'Test\n12345 Ort' },
            blocks: [{ type: 'paragraph', text: 'Brieftext.' }],
          }),
          { locale: 'de-DE' }
        );
        const verification = await verifyPdf(result.bytes, PDF_TYPE_AREA);
        expect(verification.problems).toEqual([]);
      }
    });

    it('wiederholt die Tabellen-Kopfzeile nach einem Seitenumbruch', async () => {
      const result = await renderPdf(
        spec({
          blocks: [
            {
              type: 'table',
              columns: ['Nr', 'Massnahme', 'Kosten'],
              rows: Array.from({ length: 60 }, (_, i) => [
                String(i + 1),
                `Zeile ${i + 1}`,
                '1 EUR',
              ]),
            },
          ],
        }),
        { locale: 'de-DE' }
      );
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = pdfjs.getDocument({ data: new Uint8Array(result.bytes) });
      const doc = await task.promise;
      expect(doc.numPages).toBeGreaterThan(1);
      const second = await (await doc.getPage(2)).getTextContent();
      const text = second.items.map((i) => ('str' in i ? i.str : '')).join(' ');
      await task.destroy();
      expect(text).toContain('Massnahme');
    });

    it('prüft Glyphen auch in Beschriftungen, nicht nur im Fließtext', async () => {
      const result = await renderPdf(
        spec({
          kind: 'form',
          blocks: [
            { type: 'field', kind: 'text', label: 'Weg → Ziel', help: 'Häkchen ✓ hier' },
            { type: 'signature', labels: ['Unterschrift → hier'] },
          ],
        }),
        { locale: 'de-DE' }
      );
      const text = await extractText(result.bytes);
      expect(text).toContain('Weg -> Ziel');
      expect(text).toContain('Häkchen x hier');
    });
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

  describe('Gliederung der Überschriften', () => {
    const headingRoles = async (levels: (1 | 2 | 3)[]): Promise<string[]> => {
      const result = await renderPdf(
        spec({
          blocks: levels.map((level, i) => ({
            type: 'heading' as const,
            level,
            text: `Abschnitt ${i + 1}`,
          })),
        }),
        { locale: 'de-DE' }
      );
      const counts = await countRoles(result.bytes);
      return Object.entries(counts)
        .filter(([role]) => /^\/H[1-6]$/.test(role))
        .flatMap(([role, n]) => Array.from({ length: n }, () => role.slice(1)))
        .sort();
    };

    it('lässt gleichrangige Überschriften Geschwister bleiben', async () => {
      // Drei gleichrangige Abschnitte ergaben vorher H2 + zwei untergeordnete
      // H3: der Screenreader kündigte eine Gliederung an, die es nicht gibt.
      expect(await headingRoles([3, 3, 3])).toEqual(['H1', 'H2', 'H2', 'H2']);
    });

    it('bildet echte Verschachtelung weiterhin ab', async () => {
      expect(await headingRoles([1, 2, 1])).toEqual(['H1', 'H2', 'H2', 'H3']);
    });
  });

  describe('Zeichen ohne Glyphe', () => {
    it('setzt zerlegte Umlaute (NFD) korrekt', async () => {
      // In zerlegter Form fiel das kombinierende Trema heraus und aus
      // "Wärmeplanung für Österreich" wurde "Warmeplanung fur Osterreich".
      const result = await renderPdf(
        spec({
          blocks: [{ type: 'paragraph', text: 'Wärmeplanung für Österreich'.normalize('NFD') }],
        }),
        { locale: 'de-DE' }
      );
      expect(await extractText(result.bytes)).toContain('Wärmeplanung für Österreich');
      expect(result.missingGlyphs).toEqual([]);
    });

    it('meldet, wie viele Zeichen es verworfen hat', async () => {
      const result = await renderPdf(
        spec({ blocks: [{ type: 'paragraph', text: '绿色政策 绿色' }] }),
        { locale: 'de-DE' }
      );
      // Die Menge allein verschweigt das Ausmaß: vier verschiedene Zeichen,
      // aber sechs verworfene Vorkommen.
      expect(result.missingGlyphs.sort()).toEqual(['政', '策', '绿', '色']);
      expect(result.droppedGlyphCount).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Verschachtelte Listen', () => {
    const nested = () =>
      renderPdf(
        spec({
          blocks: [
            {
              type: 'list',
              ordered: true,
              items: [
                { text: 'Beschluss', level: 0, ordered: true },
                { text: 'Ausschreibung', level: 0, ordered: true },
                { text: 'Unterlagen', level: 1, ordered: true },
                { text: 'Veröffentlichung', level: 1, ordered: true },
                { text: 'Vergabe', level: 0, ordered: true },
              ],
            },
          ],
        }),
        { locale: 'de-DE' }
      );

    it('zählt jede Ebene eigenständig', async () => {
      const text = await extractText((await nested()).bytes);
      // Zählte die Unterebene mit, stünde hier "3." vor Unterlagen und
      // "5." vor Vergabe — eine falsche Gliederung, kein Schönheitsfehler.
      expect(text).toContain('1. Unterlagen');
      expect(text).toContain('2. Veröffentlichung');
      expect(text).toContain('3. Vergabe');
    });

    it('hängt die Unterliste in den LBody, nicht neben ihn', async () => {
      // PDF/UA 7.2-20: ein LI darf nur Lbl und LBody enthalten. Ein L als
      // drittes Geschwister macht das Dokument nicht konform.
      const roles = await structRoles((await nested()).bytes);
      const li = roles.indexOf('LI');
      expect(li).toBeGreaterThanOrEqual(0);
      expect(roles.filter((r) => r === 'L').length).toBeGreaterThan(1);
      expect(roles.slice(li + 1, li + 3)).toEqual(['Lbl', 'LBody']);
    });
  });

  describe('Wortgrenzen', () => {
    // Segmente entstehen bei jedem Formatwechsel und bei maskierten Zeichen.
    // Wurde jedes Segment als eigenes Wort behandelt, setzte der Umbruch ein
    // Leerzeichen mitten ins Wort — im Satzbild sichtbar als "Datei _ name".
    it('zerlegt ein Wort nicht an maskierten Zeichen', async () => {
      const result = await renderPdf(
        spec({ blocks: [{ type: 'paragraph', text: 'Die Datei\\_name\\_hier ist gemeint.' }] }),
        { locale: 'de-DE' }
      );
      expect(await extractText(result.bytes)).toContain('Datei_name_hier');
    });

    it('trennt weiterhin an echtem Leerzeichen', async () => {
      const result = await renderPdf(
        spec({ blocks: [{ type: 'paragraph', text: 'erstes zweites drittes' }] }),
        { locale: 'de-DE' }
      );
      const text = await extractText(result.bytes);
      expect(text).toContain('erstes zweites drittes');
    });

    it('behält den Zeilenumbruch aus \\n', async () => {
      const broken = await renderPdf(
        spec({ blocks: [{ type: 'paragraph', text: 'oben\nunten' }] }),
        {
          locale: 'de-DE',
        }
      );
      const joined = await renderPdf(
        spec({ blocks: [{ type: 'paragraph', text: 'oben unten' }] }),
        {
          locale: 'de-DE',
        }
      );
      // Gemessen an der Grundlinie, nicht am Text: extractText verkettet ohne
      // Trennzeichen und könnte einen fehlenden Umbruch nicht sichtbar machen.
      expect(await baselineCount(broken.bytes)).toBe((await baselineCount(joined.bytes)) + 1);
    });
  });
});
