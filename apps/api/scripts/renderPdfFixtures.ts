/* Renders the PDF fixtures that the accessibility validator checks. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EXPORT_FIXTURES } from '../services/pdf/__fixtures__/contentInvariance.js';
import { contentToBlocks } from '../services/pdf/contentToBlocks.js';
import { renderPdf } from '../services/pdf/pdfRenderer.js';

import type { PdfDocumentSpec } from '../services/pdf/pdfDocument.js';

const outDir = process.argv[2] ?? '/tmp/pdf-fixtures';

const document: PdfDocumentSpec = {
  title: 'Radverkehr in Musterstadt',
  subtitle: 'Maßnahmenübersicht 2026',
  kind: 'document',
  language: 'de-DE',
  blocks: [
    { type: 'paragraph', text: 'Dieses Papier fasst die **geplanten Maßnahmen** zusammen.' },
    { type: 'heading', level: 2, text: 'Ausgangslage' },
    { type: 'list', items: ['12 km Radweg fehlen', 'Drei Kreuzungen ohne sichere Führung'] },
    {
      type: 'table',
      columns: ['Nr.', 'Maßnahme', 'Kosten'],
      rows: [
        ['1', 'Radweg Bahnhofstraße', '1,2 Mio. €'],
        ['2', 'Kreuzung Marktplatz umbauen', '480.000 €'],
      ],
      caption: 'Priorisierte Maßnahmen',
    },
    { type: 'keyvalue', entries: [{ label: 'Beschlussdatum', value: '12.02.2026' }] },
    { type: 'note', title: 'Hinweis', text: 'Die Kosten sind Schätzungen.' },
    { type: 'quote', text: 'Sichere Radwege sind Daseinsvorsorge.', source: 'Verkehrsausschuss' },
    { type: 'divider' },
    { type: 'signature', labels: ['Ort, Datum', 'Unterschrift'] },
  ],
};

const form: PdfDocumentSpec = {
  title: 'Anmeldung zur Mitgliederversammlung',
  kind: 'form',
  language: 'de-DE',
  blocks: [
    { type: 'paragraph', text: 'Bitte bis zum 01.04.2026 zurücksenden.' },
    { type: 'heading', level: 2, text: 'Angaben zur Person' },
    { type: 'field', kind: 'text', label: 'Vorname', width: 'half', required: true },
    { type: 'field', kind: 'text', label: 'Nachname', width: 'half', required: true },
    { type: 'field', kind: 'text', label: 'E-Mail', help: 'Für die Bestätigung' },
    { type: 'field', kind: 'date', label: 'Geburtsdatum' },
    { type: 'field', kind: 'select', label: 'Gliederung', options: ['KV Nord', 'KV Süd'] },
    { type: 'field', kind: 'radio', label: 'Teilnahmeform', options: ['Vor Ort', 'Digital'] },
    { type: 'field', kind: 'checkbox', label: 'Ich benötige eine barrierefreie Zufahrt' },
    { type: 'field', kind: 'multiline', label: 'Anmerkungen', rows: 3 },
    { type: 'signature', labels: ['Ort, Datum', 'Unterschrift'] },
  ],
};

const letter: PdfDocumentSpec = {
  title: 'Anfrage Radverkehr',
  kind: 'letter',
  language: 'de-DE',
  letter: {
    recipient: 'Stadt Musterstadt\nStadtplanungsamt\nRathausplatz 1\n12345 Musterstadt',
    place: 'Musterstadt',
    subject: 'Anfrage zum Ausbau des Radwegenetzes',
    salutation: 'Sehr geehrte Damen und Herren,',
    closing: 'Mit freundlichen Grüßen',
    signature: 'Maxi Mustermensch\nFraktionsvorsitz',
  },
  blocks: [
    { type: 'paragraph', text: 'wir bitten um Auskunft über den Stand des Radwegeausbaus.' },
    { type: 'list', ordered: true, items: ['Zeitplan', 'Kosten', 'Beteiligung'] },
  ],
};

const long: PdfDocumentSpec = {
  title: 'Mehrseitiges Dokument',
  kind: 'document',
  language: 'de-DE',
  blocks: Array.from({ length: 40 }, (_, i) => ({
    type: 'paragraph' as const,
    text: `Absatz ${i + 1}: ${'Text '.repeat(30)}`,
  })),
};

/**
 * Everything that has broken PDF/UA conformance at least once. Four well-behaved
 * fixtures proved little — these are the ones that actually guard the claim:
 * the "ff" ligature (7.21.5/7.21.7), characters with no glyph (7.21.8), a
 * skipped heading level (7.4.2), and a table row with more cells than columns.
 */
const hostile: PdfDocumentSpec = {
  title: 'Öffentlichkeitsarbeit: Treffen und Auffahrt',
  kind: 'document',
  language: 'de-DE',
  blocks: [
    { type: 'heading', level: 3, text: 'Beginnt absichtlich auf Ebene 3' },
    { type: 'paragraph', text: 'Ablauf: Antrag → Prüfung → Beschluss.' },
    { type: 'list', items: ['✓ erledigt', '✗ offen', '☐ geplant'] },
    { type: 'table', columns: ['Schritt', 'Status'], rows: [['1', 'läuft', 'Überhang']] },
    { type: 'note', title: 'Hinweis', text: 'Pfeil → im Kasten, Häkchen ✓ daneben.' },
    { type: 'heading', level: 3, text: 'Springt zurück auf Ebene 3' },
    { type: 'paragraph', text: 'Zahlen: 12 m² · 3 °C · 45 ‰ · 7 € · CO₂-Ausstoß.' },
  ],
};

await mkdir(outDir, { recursive: true });
for (const [name, spec] of Object.entries({ document, form, letter, long, hostile })) {
  const result = await renderPdf(spec, {
    locale: 'de-DE',
    sender: { name: 'Maxi Mustermensch', organization: 'KV Musterstadt' },
  });
  await writeFile(path.join(outDir, `${name}.pdf`), result.bytes);
}

// The document-export corpus goes through the same validator: since the export
// shares this renderer, real stored content (markdown and editor HTML, both
// deliberately hostile) has to hold up to PDF/UA too — not just hand-written
// specs. Locale alternates so the AT theme's fonts are covered as well.
const exportFixtureDir = new URL('../services/pdf/__fixtures__/export-content/', import.meta.url);
for (const [i, fixture] of EXPORT_FIXTURES.entries()) {
  const source = await readFile(new URL(fixture.file, exportFixtureDir), 'utf8');
  const result = await renderPdf(
    {
      title: fixture.name,
      kind: 'document',
      language: i % 2 === 0 ? 'de-DE' : 'de-AT',
      blocks: contentToBlocks(source),
    },
    { locale: i % 2 === 0 ? 'de-DE' : 'de-AT' }
  );
  await writeFile(path.join(outDir, `export-${fixture.name}.pdf`), result.bytes);
}

console.log(`Fixtures in ${outDir}`);
