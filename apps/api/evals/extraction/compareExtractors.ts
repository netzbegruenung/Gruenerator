/**
 * Stellt die drei Extraktionswege für dieselbe PDF nebeneinander und misst,
 * wie viele Zellen der Tabelle „Übersicht der wichtigsten Speicherfristen"
 * jeder davon wortgetreu liefert.
 *
 * NICHT in der CI: Mistral OCR braucht `MISTRAL_API_KEY` und kostet pro Lauf.
 * Der deterministische Teil (PDF.js) ist als `tableExtraction.vitest.ts` daneben
 * festgeschrieben und läuft ohne Netz.
 *
 *   pnpm --filter @gruenerator/api exec tsx evals/extraction/compareExtractors.ts
 *
 * Optional ein eigenes PDF als Argument; ohne Argument läuft es gegen die
 * Fixture, für die `EXPECTED_ROWS` den Soll-Stand festhält.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Mistral } from '@mistralai/mistralai';

import { EXPECTED_ROWS } from './expectedTable.js';
import { extractWithPdfJs } from './extractWithPdfJs.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'tabellen-pdf.pdf');

/** Anteil der Tabellenzellen, die wortgetreu im Text stehen. */
function trefferquote(text: string): { heil: number; gesamt: number; fehlend: string[] } {
  const zellen = EXPECTED_ROWS.flatMap((r) => [r.datenart, r.speicherdauer]);
  const fehlend = zellen.filter((z) => !text.includes(z));
  return { heil: zellen.length - fehlend.length, gesamt: zellen.length, fehlend };
}

function bericht(name: string, text: string): void {
  const { heil, gesamt, fehlend } = trefferquote(text);
  console.log(`\n### ${name}`);
  console.log(`    Zeichen:  ${text.length}`);
  console.log(`    Zellen:   ${heil}/${gesamt} wortgetreu`);
  if (fehlend.length > 0) {
    for (const z of fehlend) console.log(`      fehlt: ${JSON.stringify(z)}`);
  }
}

async function mistralOcr(bytes: Buffer, tableFormat?: 'html' | 'markdown'): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY fehlt');

  const res = await new Mistral({ apiKey }).ocr.process({
    model: 'mistral-ocr-4-0',
    document: {
      type: 'document_url',
      documentUrl: `data:application/pdf;base64,${bytes.toString('base64')}`,
    },
    includeImageBase64: false,
    ...(tableFormat ? { tableFormat } : {}),
  });

  return res.pages
    .map((p) => p.markdown)
    .filter((t) => t.trim())
    .join('\n\n---\n\n')
    .trim();
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? FIXTURE;
  const bytes = readFileSync(path);
  console.log(`PDF: ${path}`);

  bericht(
    'PDF.js direkt — was heute in Qdrant landet',
    await extractWithPdfJs(new Uint8Array(bytes))
  );

  if (!process.env.MISTRAL_API_KEY) {
    console.log('\n(MISTRAL_API_KEY nicht gesetzt — OCR-Vergleich übersprungen)');
    return;
  }

  bericht(
    "Mistral OCR mit tableFormat:'html' — heutiger Anhang-Pfad",
    await mistralOcr(bytes, 'html')
  );
  bericht('Mistral OCR OHNE tableFormat — Tabellen inline', await mistralOcr(bytes));
}

await main();
