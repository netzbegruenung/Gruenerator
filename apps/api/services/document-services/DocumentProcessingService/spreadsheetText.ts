/**
 * Tabellendateien (CSV, XLSX, XLS, ODS) als Markdown-Tabellen.
 *
 * Gelesen wird Zelle für Zelle, nicht per OCR: eine Tabelle hat ihre Struktur
 * schon, sie muss nur erhalten bleiben. Der Chunker erkennt Pipe-Tabellen
 * (`blockSegmentation.ts`) und teilt eine große zeilenweise mit wiederholtem
 * Kopf — ohne diese Form zerschnitt er eine CSV wie Fliesstext, und ab dem
 * zweiten Chunk standen Zahlen ohne Spaltennamen im Index.
 *
 * Je Blatt ein Abschnitt `## <Blattname>` (landet im Überschriftenpfad jedes
 * Chunks); Zeilen mit höchstens einer Zelle vor der ersten echten Zeile sind
 * Titel und stehen als Text darüber. Ausgeblendete Blätter fehlen, weil die
 * Person sie nicht sieht.
 *
 * Werte erscheinen so, wie Excel sie in Deutschland anzeigt: SheetJS formatiert
 * Zahlen mit englischen Trennzeichen („1,250.00 €"), die hier getauscht werden,
 * und lässt bei deutschen Datumsformaten den Anzeigetext leer — Daten werden
 * deshalb selbst als TT.MM.JJJJ geschrieben. CSV-Werte bleiben unverändert
 * (`raw`), sonst würde aus der Postleitzahl 01067 die Zahl 1067.
 */

import { type DocumentUploadFormat } from '@gruenerator/contracts';
import * as XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';

import { DocumentReadError } from './processingError.js';

// Ältere .xls (BIFF5 und früher) speichern Text in einer Windows-Codepage.
XLSX.set_cptable(cptable);

/** Darüber hinaus gehört eine Tabelle in die Tabellen-Auswertung, nicht in die Suche. */
export const MAX_TABLE_ROWS = 20_000;

export type SpreadsheetExtension = Extract<DocumentUploadFormat, { kind: 'table' }>['extension'];

function decodeCsv(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Excel speichert „CSV (Trennzeichen-getrennt)" in Windows-1252.
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

function formatDate(value: Date): string {
  // Excel speichert Uhrzeiten als Bruchteil eines Tages; 14:30 kommt als 14:29:59,999 an.
  const d = new Date(Math.round(value.getTime() / 60_000) * 60_000);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  // Reine Uhrzeiten liegen auf Excels Tag 0 (30.12.1899).
  if (d.getUTCFullYear() < 1900) return time;
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  return time === '00:00' ? date : `${date} ${time}`;
}

/** Tauscht Punkt und Komma nur innerhalb der Ziffernfolge — „Mio." bleibt „Mio.". */
function germanSeparators(text: string): string {
  return text.replace(/\d[\d.,]*\d/g, (digits) =>
    digits.replace(/[.,]/g, (c) => (c === '.' ? ',' : '.'))
  );
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  let text: string;
  switch (cell.t) {
    case 'd':
      text = cell.v instanceof Date ? formatDate(cell.v) : String(cell.w ?? '');
      break;
    case 'n':
      text = germanSeparators(cell.w ?? String(cell.v ?? ''));
      break;
    case 'b':
      text = cell.v ? 'WAHR' : 'FALSCH';
      break;
    default:
      text = String(cell.w ?? cell.v ?? '');
  }
  return text
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .replace(/[\\|]/g, '\\$&');
}

function sheetToMarkdown(sheet: XLSX.WorkSheet): string {
  const data = (sheet['!data'] ?? []) as Array<XLSX.CellObject[] | undefined>;
  const rows = data
    .map((row) => (row ?? []).map(cellText))
    .filter((row) => row.some((cell) => cell !== ''));

  const filled = (row: string[]): string[] => row.filter((cell) => cell !== '');
  const titles: string[] = [];
  while (rows.length > 0 && filled(rows[0]).length <= 1) {
    titles.push(filled(rows.shift() ?? []).join(''));
  }

  const parts = titles.length > 0 ? [titles.join('\n')] : [];
  if (rows.length > 0) {
    const width = Math.max(...rows.map((row) => row.length));
    const used = Array.from({ length: width }, (_, i) => i).filter((i) =>
      rows.some((row) => (row[i] ?? '') !== '')
    );
    const line = (row: string[]): string => `| ${used.map((i) => row[i] ?? '').join(' | ')} |`;
    const [header, ...body] = rows;
    parts.push(
      [line(header), `| ${used.map(() => '---').join(' | ')} |`, ...body.map(line)].join('\n')
    );
  }
  return parts.join('\n\n');
}

function tooLarge(): DocumentReadError {
  return new DocumentReadError(
    `Die Tabelle ist zu groß: mehr als ${MAX_TABLE_ROWS.toLocaleString('de-DE')} Zeilen. ` +
      'Notebooks durchsuchen Text; für Auswertungen großer Tabellen lade die Datei im Chat hoch.'
  );
}

export function spreadsheetToMarkdown(buffer: Buffer, extension: SpreadsheetExtension): string {
  const isCsv = extension === '.csv';
  // Eine Zeile mehr lesen als erlaubt, um die Überschreitung zu sehen, ohne
  // eine riesige Datei ganz in den Speicher zu holen.
  const limits = { dense: true, sheetRows: MAX_TABLE_ROWS + 1 } as const;
  const workbook = isCsv
    ? XLSX.read(decodeCsv(buffer), { ...limits, type: 'string', raw: true })
    : XLSX.read(buffer, { ...limits, type: 'buffer', cellDates: true });

  const hidden = new Set(
    (workbook.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name)
  );
  const names = workbook.SheetNames.filter((name) => !hidden.has(name));

  let rowCount = 0;
  const sections: string[] = [];
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    rowCount += (sheet['!data'] ?? []).length;
    if (rowCount > MAX_TABLE_ROWS) throw tooLarge();
    const markdown = sheetToMarkdown(sheet);
    if (markdown) sections.push(isCsv ? markdown : `## ${name}\n\n${markdown}`);
  }
  return sections.join('\n\n');
}
