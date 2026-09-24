/**
 * Erkennt Tabellenseiten an der pdfjs-Geometrie, damit nur diese Seiten an
 * Mistral OCR gehen. pdfjs liest eine Tabelle zeilenweise als Fliesstext
 * (Zellen durch Leerzeichen getrennt, mehrzeilige Zellen zerrissen); Mistral
 * gibt sie als Markdown-Tabelle zurück.
 *
 * Grundlage ist dieselbe Geometrie wie in `textItemJoin.ts`: Items werden über
 * die Grundlinie (`transform[5]`) zu Zeilen gruppiert, eine Zeile wird dort in
 * Zellen geteilt, wo die Lücke zwischen zwei Items grösser als 2 em ist.
 * Leerraum-Items zählen nicht — pdfjs füllt Tabellenlücken mit einem einzigen
 * `" "`-Item über die ganze Breite.
 *
 * Eine Tabelle ist ein Lauf von mindestens 3 Zeilen mit je mindestens 2 Zellen,
 * deren erste Zelle in derselben Spalte beginnt, und in dem mindestens 3
 * Spalten tragen. Eine Spalte trägt, wenn Zellen an ihr in mindestens 2 Zeilen
 * und in mindestens einem Viertel der Laufzeilen stehen. Eine Zelle gehört zu
 * einer Spalte, wenn Anfang ODER Ende auf ±1 em übereinstimmen — rechtsbündige
 * Zahlenspalten beginnen nie an derselben Stelle.
 *
 * Warum nicht einfach „3 Zeilen mit je 3 Zellen": Tabellen mit mehrzeiligen
 * Zellen setzen die kürzeren Zellen vertikal mittig. Deren Grundlinie liegt dann
 * neben der Zeile der Nachbarzellen, und keine einzige Zeile trägt alle drei
 * Spalten (gemessen an der Dienstleister-Tabelle in
 * `evals/extraction/__fixtures__/tabellen-pdf.pdf`, Seiten 3 und 4). Deshalb
 * verlängert eine einzellige Zeile den Lauf, wenn sie in einer seiner hinteren
 * Spalten steht; beginnt sie in der ersten Spalte, ist es Fliesstext und der
 * Lauf endet.
 *
 * Bewusst NICHT erkannt: zweispaltige Tabellen. Zweispaltiger Satz,
 * Inhaltsverzeichnisse und Register haben dieselbe Form. Dafür liefert pdfjs
 * sie schon brauchbar, eine Zeile je Tabellenzeile.
 */

import { type PdfTextItem } from './textItemJoin.js';

const CELL_GAP_EM = 2;
const COLUMN_TOLERANCE_EM = 1;
const MIN_ROWS = 3;
const MIN_COLUMNS = 3;

interface Cell {
  start: number;
  end: number;
  em: number;
}

interface Column {
  start: number;
  end: number;
  hits: number;
}

function toLines(items: readonly PdfTextItem[]): Cell[][] {
  const placed: Array<Cell & { y: number }> = [];
  for (const item of items) {
    const t = item.transform;
    if (!item.str?.trim() || !t || t.length < 6) continue;
    const em = Math.hypot(t[2], t[3]) || 1;
    placed.push({ start: t[4], end: t[4] + (item.width ?? 0), em, y: t[5] });
  }
  placed.sort((a, b) => b.y - a.y || a.start - b.start);

  const lines: Array<{ y: number; items: Cell[] }> = [];
  for (const cell of placed) {
    const line = lines.find((l) => Math.abs(l.y - cell.y) <= cell.em * 0.5);
    if (line) line.items.push(cell);
    else lines.push({ y: cell.y, items: [cell] });
  }
  lines.sort((a, b) => b.y - a.y);

  return lines.map((line) => {
    const cells: Cell[] = [];
    for (const item of line.items.sort((a, b) => a.start - b.start)) {
      const current = cells[cells.length - 1];
      if (current && item.start - current.end <= item.em * CELL_GAP_EM) {
        current.end = Math.max(current.end, item.end);
      } else {
        cells.push({ ...item });
      }
    }
    return cells;
  });
}

export function pageHasTable(items: readonly PdfTextItem[]): boolean {
  let columns: Column[] | null = null;
  let rows = 0;

  const columnOf = (cell: Cell): Column | undefined =>
    columns?.find(
      (c) =>
        Math.abs(c.start - cell.start) <= cell.em * COLUMN_TOLERANCE_EM ||
        Math.abs(c.end - cell.end) <= cell.em * COLUMN_TOLERANCE_EM
    );

  const closeRun = (): boolean => {
    const found =
      columns !== null &&
      rows >= MIN_ROWS &&
      columns.filter((c) => c.hits >= Math.max(2, rows / 4)).length >= MIN_COLUMNS;
    columns = null;
    rows = 0;
    return found;
  };

  for (const cells of toLines(items)) {
    if (cells.length >= 2) {
      if (columns && columnOf(cells[0]) === columns[0]) {
        for (const cell of cells) {
          const column = columnOf(cell);
          if (column) column.hits++;
          else columns.push({ start: cell.start, end: cell.end, hits: 1 });
        }
        rows++;
        continue;
      }
      if (closeRun()) return true;
      columns = cells.map((c) => ({ start: c.start, end: c.end, hits: 1 }));
      rows = 1;
      continue;
    }

    if (!columns) continue;
    const column = columnOf(cells[0]);
    if (column === columns[0]) {
      if (closeRun()) return true;
    } else if (column) {
      column.hits++;
    }
  }
  return closeRun();
}
