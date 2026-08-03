/**
 * Adapter: gespeicherter Dokumentinhalt (Markdown ODER HTML) → `PdfBlock[]`.
 *
 * Der getaggte Renderer nimmt eine Blockliste statt eines Text-Blobs entgegen;
 * dieser Adapter ist die Brücke vom Editor-Inhalt dorthin. Tragende Invariante:
 * **kein sichtbares Wort darf verlorengehen** — unbekannte Konstrukte landen
 * lieber als Absatz im Dokument, als still zu verschwinden.
 *
 * Zwei Fallstricke, die das Format hier diktieren:
 *  1. Der Renderer parst Blocktext NOCHMAL als Inline-Markdown
 *     (`inlineSegments` → `marked.Lexer.lexInline`). Text, der aus HTML oder aus
 *     einem Codeblock stammt, ist kein Markdown und wird deshalb maskiert.
 *  2. Der Renderer dekodiert Entities (`&amp;` zuletzt). Aus HTML gewonnener
 *     Text ist bereits dekodiert — er wird re-enkodiert, damit genau eine
 *     Dekodierung stattfindet und `&amp;lt;` nicht zu `<` kollabiert.
 */

import * as cheerio from 'cheerio';
import { marked, type Token, type Tokens } from 'marked';

import { type PdfBlock } from './pdfDocument.js';

/** Schemagrenzen aus `pdfDocument.ts`; hier eingehalten statt später gekappt. */
const MAX_TEXT = 20000;
const MAX_LIST_ITEMS = 200;
const MAX_TABLE_ROWS = 200;
const MAX_COLUMNS = 8;
const MAX_CAPTION = 300;
const MAX_KV_LABEL = 200;
const MAX_KV_VALUE = 2000;
const MAX_KV_ENTRIES = 60;
/** Tieferes wird auf diese Ebene gefaltet — das Schema lässt 0–3 zu. */
const MAX_LIST_LEVEL = 3;
/** Deckel gegen `colspan="10000"`: ein Raster darf nicht den Speicher sprengen. */
const MAX_SPAN = 64;
const MAX_GRID_COLUMNS = 512;

interface ListEntry {
  text: string;
  level: number;
  ordered: boolean;
}

const EMPTY_FALLBACK: PdfBlock = {
  type: 'paragraph',
  text: 'Dieses Dokument enthält keinen Inhalt.',
};

/**
 * Minimaler Knoten-Typ statt der domhandler-Typen: domhandler ist nur eine
 * transitive Abhängigkeit von cheerio und unter pnpm nicht garantiert auflösbar.
 */
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

/**
 * Wie Blockelemente durch eine sichtbare Grenze getrennt, aber keine echten
 * Blöcke: eine Tabelle in einer Zelle ergab sonst "Innen1Innen2".
 */
const SEPARATED_TAGS = new Set([...BLOCK_TAGS, 'td', 'th', 'tr']);

/** Unsichtbar im Dokument — Inhalt darf und muss hier verlorengehen. */
const INVISIBLE_TAGS = new Set(['script', 'style', 'head', 'title', 'noscript', 'template']);

// ── Textnormalisierung ───────────────────────────────────────────────────────

/**
 * Neutralisiert Inline-Marker für den zweiten Lauf im Renderer und kodiert
 * Entities genau einmal. Reihenfolge ist heikel: erst die Markdown-Marker, dann
 * `&`, erst danach `<`/`>` — sonst würde das eigene `&amp;` wieder verpackt.
 */
export function escapeInline(text: string): string {
  return text
    .replace(/[\\`*_[\]~]/g, '\\$&')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function collapse(text: string): string {
  return text.replace(/[^\S\n]+/g, ' ');
}

function nonEmpty(text: string): string | null {
  const trimmed = text.replace(/[ \t]+$/gm, '').trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Zerlegt an einer Wortgrenze in Kopf (≤ `limit`) und Rest. Der Rest wird von
 * den Aufrufern als Folgeblock ausgegeben — ein Feld mit harter Schemagrenze
 * darf kürzen, aber der abgeschnittene Teil muss im Dokument bleiben.
 */
function splitAtLimit(text: string, limit: number): [string, string] {
  if (text.length <= limit) return [text, ''];
  const head = text.slice(0, limit);
  const cut = head.lastIndexOf(' ');
  // Ein einziges überlanges Wort hat keine Wortgrenze — dann hart schneiden.
  if (cut <= 0) return [head, text.slice(limit)];
  return [head.slice(0, cut), text.slice(cut + 1)];
}

// ── Blockfabrik ──────────────────────────────────────────────────────────────

/**
 * Sammelt Blöcke und hält dabei die Schemagrenzen ein: zu langer Text wird auf
 * mehrere Blöcke verteilt, nie beschnitten.
 */
class BlockSink {
  readonly blocks: PdfBlock[] = [];

  private chunks(text: string): string[] {
    if (text.length <= MAX_TEXT) return [text];
    const out: string[] = [];
    for (let i = 0; i < text.length; i += MAX_TEXT) out.push(text.slice(i, i + MAX_TEXT));
    return out;
  }

  paragraph(text: string): void {
    const clean = nonEmpty(text);
    if (!clean) return;
    for (const chunk of this.chunks(clean)) this.blocks.push({ type: 'paragraph', text: chunk });
  }

  heading(level: number, text: string): void {
    const clean = nonEmpty(text);
    if (!clean) return;
    // h4–h6 gibt es im Blockmodell nicht; klemmen statt zum Absatz degradieren.
    const clamped = (Math.min(Math.max(level, 1), 3) || 1) as 1 | 2 | 3;
    const [first, ...rest] = this.chunks(clean);
    this.blocks.push({ type: 'heading', level: clamped, text: first });
    for (const chunk of rest) this.paragraph(chunk);
  }

  quote(text: string): void {
    const clean = nonEmpty(text);
    if (!clean) return;
    const [first, ...rest] = this.chunks(clean);
    this.blocks.push({ type: 'quote', text: first });
    for (const chunk of rest) this.paragraph(chunk);
  }

  note(text: string): void {
    const clean = text.replace(/\s+$/, '');
    if (!clean.trim()) return;
    const [first, ...rest] = this.chunks(clean);
    this.blocks.push({ type: 'note', text: first });
    for (const chunk of rest) this.blocks.push({ type: 'note', text: chunk });
  }

  list(items: ListEntry[], ordered: boolean): void {
    const clean = items
      .map((entry) => ({ ...entry, text: entry.text.replace(/\s+$/, '') }))
      .filter((entry) => entry.text.trim().length);
    if (!clean.length) return;
    // Ein Eintrag jenseits der Schemagrenze wird nicht gekappt: der Kopf bleibt
    // der Listeneintrag, der Rest folgt als Absatz hinter der Liste.
    const overflow: string[] = [];
    const bounded = clean.map((entry) => {
      const [head, rest] = splitAtLimit(entry.text, MAX_TEXT);
      if (rest) overflow.push(rest);
      return { text: head, level: entry.level, ordered: entry.ordered };
    });
    for (let i = 0; i < bounded.length; i += MAX_LIST_ITEMS) {
      const slice = bounded.slice(i, i + MAX_LIST_ITEMS);
      this.blocks.push(
        ordered ? { type: 'list', ordered: true, items: slice } : { type: 'list', items: slice }
      );
    }
    for (const rest of overflow) this.paragraph(rest);
  }

  table(columns: string[], rows: string[][], caption: string | null): void {
    const foldedColumns = foldCells(columns);
    if (!foldedColumns.length) {
      // Ohne Kopfzeile ist `columns` nicht befüllbar — dann lieber Zeilen als
      // Absätze ausgeben, als die Tabelle zu verwerfen.
      if (caption) this.paragraph(caption);
      for (const row of rows) this.paragraph(row.join(' · '));
      return;
    }
    const [head, captionRest] = caption ? splitAtLimit(caption, MAX_CAPTION) : ['', ''];
    const foldedRows = rows.map(foldCells);
    for (let i = 0; i < Math.max(foldedRows.length, 1); i += MAX_TABLE_ROWS) {
      const slice = foldedRows.slice(i, i + MAX_TABLE_ROWS);
      const block: Extract<PdfBlock, { type: 'table' }> = {
        type: 'table',
        columns: foldedColumns,
        rows: slice,
      };
      if (head && i === 0) block.caption = head;
      this.blocks.push(block);
      if (!foldedRows.length) break;
    }
    if (captionRest) this.paragraph(captionRest);
  }

  divider(): void {
    this.blocks.push({ type: 'divider' });
  }

  keyvalue(entries: { label: string; value: string }[]): void {
    const clean = entries.filter((e) => e.label.trim() || e.value.trim());
    if (!clean.length) return;
    // Label und Wert haben enge Schemagrenzen; was nicht hineinpasst, wandert
    // als Absatz hinter die Liste statt ersatzlos zu verschwinden.
    const overflow: string[] = [];
    const bounded = clean.map((e) => {
      const [label, labelRest] = splitAtLimit(e.label, MAX_KV_LABEL);
      const [value, valueRest] = splitAtLimit(e.value, MAX_KV_VALUE);
      if (labelRest) overflow.push(labelRest);
      if (valueRest) overflow.push(valueRest);
      return { label, value };
    });
    for (let i = 0; i < bounded.length; i += MAX_KV_ENTRIES) {
      this.blocks.push({ type: 'keyvalue', entries: bounded.slice(i, i + MAX_KV_ENTRIES) });
    }
    for (const rest of overflow) this.paragraph(rest);
  }
}

/**
 * Mehr als 8 Spalten erlaubt das Schema nicht — die überzähligen Zellen wandern
 * in die letzte, statt abgeschnitten zu werden.
 */
function foldCells(cells: string[]): string[] {
  const trimmed = cells.map((c) => c.trim());
  if (trimmed.length <= MAX_COLUMNS) return trimmed;
  const kept = trimmed.slice(0, MAX_COLUMNS - 1);
  kept.push(
    trimmed
      .slice(MAX_COLUMNS - 1)
      .filter(Boolean)
      .join(' · ')
  );
  return kept;
}

// ── Markdown ─────────────────────────────────────────────────────────────────

/** Der Rohtext eines Blocktokens; Inline-Markdown bleibt stehen (gewollt). */
function tokenText(token: Token): string {
  const withText = token as { text?: string; raw?: string };
  return withText.text ?? withText.raw ?? '';
}

function flattenListItems(list: Tokens.List, depth: number, out: ListEntry[]): void {
  for (const item of list.items) {
    const own: string[] = [];
    const nested: Tokens.List[] = [];
    for (const token of item.tokens ?? []) {
      if (token.type === 'list') nested.push(token as Tokens.List);
      else if (token.type === 'code') own.push(escapeInline(tokenText(token)));
      else own.push(tokenText(token));
    }
    // Bewusst ASCII statt ☑/☐: ☑ steckt im Emoji-Font, ☐ nicht — gemischt
    // gesetzt sähen die beiden Kästchen in derselben Liste verschieden aus.
    const task = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
    // marked lässt die Checkbox je nach Token-Variante im Text stehen.
    const body = collapse(own.join(' '))
      .trim()
      .replace(/^\[[ xX]\]\s*/, '');
    const text = `${task}${body}`;
    // Die Tiefe wandert als Feld mit, nicht als Einrückung im Text: der
    // Renderer baut daraus wieder echte Unterlisten mit eigener Zählung.
    if (text.trim()) {
      out.push({ text, level: Math.min(depth, MAX_LIST_LEVEL), ordered: Boolean(list.ordered) });
    }
    for (const child of nested) flattenListItems(child, depth + 1, out);
  }
}

/**
 * Zerlegt eine Markdown-Tabellenzeile in Zellen. `\|` gehört zum Inhalt und ist
 * keine Spaltengrenze; wie bei marked wird es dabei entwertet.
 */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && i + 1 < line.length) {
      current += char + line[i + 1];
      i += 1;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  // Rand-Pipes erzeugen je eine leere Zelle, die es im Dokument nicht gibt.
  if (/^\s*\|/.test(line)) cells.shift();
  if (cells.length && /[^\\]\|\s*$/.test(line)) cells.pop();
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/**
 * marked kappt jede Zeile hart auf die Breite der Kopfzeile — überzählige Zellen
 * sind im Token schon weg. Nur der Rohtext hat sie noch, also wird die Zeile bei
 * Verdacht daraus neu zerlegt (der HTML-Pfad behält sie ebenfalls).
 */
function markdownTableRows(table: Tokens.Table): string[][] {
  const parsed = table.rows.map((row) => row.map((cell) => cell.text));
  const lines = (table.raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length)
    .slice(2);
  return parsed.map((row, index) => {
    const line = lines[index];
    if (!line) return row;
    const cells = splitTableRow(line);
    return cells.length > row.length ? cells : row;
  });
}

function markdownTokensToBlocks(tokens: Token[], sink: BlockSink): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;
      case 'heading':
        sink.heading((token as Tokens.Heading).depth, (token as Tokens.Heading).text);
        break;
      case 'paragraph':
      case 'text':
        sink.paragraph(collapse(tokenText(token)));
        break;
      case 'code':
        // Als Kasten ohne Titel; `\n` überlebt bis in den Renderer.
        sink.note(escapeInline((token as Tokens.Code).text));
        break;
      case 'blockquote':
        sink.quote(collapse(tokenText(token)));
        break;
      case 'hr':
        sink.divider();
        break;
      case 'list': {
        const list = token as Tokens.List;
        const items: ListEntry[] = [];
        flattenListItems(list, 0, items);
        sink.list(items, Boolean(list.ordered));
        break;
      }
      case 'table': {
        const table = token as Tokens.Table;
        sink.table(
          table.header.map((cell) => cell.text),
          markdownTableRows(table),
          null
        );
        break;
      }
      case 'html': {
        // Rohes HTML mitten im Markdown: über den HTML-Pfad, nicht wegwerfen.
        const html = tokenText(token);
        if (html.trim()) htmlToSink(html, sink);
        break;
      }
      default: {
        const raw = (token as { raw?: string }).raw;
        if (raw && raw.trim()) sink.paragraph(collapse(raw));
      }
    }
  }
}

export function markdownToBlocks(content: string): PdfBlock[] {
  const sink = new BlockSink();
  markdownTokensToBlocks(marked.lexer(content), sink);
  return sink.blocks;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function isElement(node: DomNode): boolean {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

/**
 * Sichtbarer Text eines Teilbaums, maskiert und mit `<br>` als Zeilenumbruch.
 * Zeilenumbrüche in der Quelle sind in HTML gewöhnlicher Weißraum — außer in
 * `<pre>`, wo sie den Codeblock ausmachen.
 */
function inlineText(node: DomNode, pre = false): string {
  if (node.type === 'text') {
    const data = node.data ?? '';
    const raw = pre ? data : data.replace(/\s+/g, ' ');
    return raw ? escapeInline(raw) : '';
  }
  if (!isElement(node)) return '';
  const name = node.name ?? '';
  if (INVISIBLE_TAGS.has(name)) return '';
  if (name === 'br') return '\n';
  // Der Alternativtext IST der Inhalt eines Bildes — für ein barrierefreies
  // Dokument die einzige Fassung, die ein Screenreader je zu hören bekommt.
  if (name === 'img') {
    const alt = node.attribs?.alt?.trim();
    return alt ? escapeInline(alt) : '';
  }
  const inner = (node.children ?? [])
    .map((child) => {
      const text = inlineText(child, pre);
      // Blockelemente sind im Dokument durch eine Grenze getrennt. Ohne
      // Trenner verschmolz eine Tabelle in einer Zelle zu "AussenInnen1".
      return !pre && isElement(child) && SEPARATED_TAGS.has(child.name ?? '') ? ` ${text} ` : text;
    })
    .join('');
  if (!inner.trim()) return inner;
  // Fettung ist die einzige Auszeichnung, die den Escaping-Pass überleben darf:
  // der Inhalt ist bereits maskiert, die Sternchen sind deshalb eindeutig.
  if (name === 'strong' || name === 'b') return `**${inner}**`;
  return inner;
}

function cellText(node: DomNode): string {
  return collapse(inlineText(node)).replace(/\n/g, ' ').trim();
}

function childElements(node: DomNode, names: string[]): DomNode[] {
  const wanted = new Set(names);
  const out: DomNode[] = [];
  const walk = (current: DomNode): void => {
    for (const child of current.children ?? []) {
      if (!isElement(child)) continue;
      if (wanted.has(child.name ?? '')) out.push(child);
      else walk(child);
    }
  };
  walk(node);
  return out;
}

/**
 * Direkte Kinder einer Liste in Dokumentreihenfolge — aber durch Wrapper
 * hindurch. Editoren schieben `<div>` zwischen `<ul>` und `<li>`, und parse5
 * repariert das nicht: wurden nur direkte `li`-Kinder gelesen, verschwand eine
 * so verpackte Liste restlos. Bestand ein Dokument nur daraus, kam am Ende
 * "Dieses Dokument enthält keinen Inhalt." heraus.
 */
function listChildren(list: DomNode): DomNode[] {
  const out: DomNode[] = [];
  const walk = (current: DomNode): void => {
    for (const child of current.children ?? []) {
      if (child.type === 'text') {
        if ((child.data ?? '').trim()) out.push(child);
        continue;
      }
      if (!isElement(child)) continue;
      const name = child.name ?? '';
      // Unterlisten gehören zu ihrem `li`; hier nicht hineinlaufen.
      if (name === 'li' || name === 'ul' || name === 'ol') out.push(child);
      else walk(child);
    }
  };
  walk(list);
  return out;
}

/** Text eines `li` und seine Unterlisten, getrennt — auch durch Wrapper hindurch. */
function splitListItem(li: DomNode): { text: string; nested: DomNode[] } {
  const nested: DomNode[] = [];
  const parts: string[] = [];
  const walk = (node: DomNode): void => {
    for (const child of node.children ?? []) {
      if (isElement(child) && (child.name === 'ul' || child.name === 'ol')) {
        nested.push(child);
        continue;
      }
      if (isElement(child) && BLOCK_TAGS.has(child.name ?? '')) {
        parts.push(' ');
        walk(child);
        parts.push(' ');
        continue;
      }
      parts.push(inlineText(child));
    }
  };
  walk(li);
  return { text: collapse(parts.join('')).trim(), nested };
}

function collectHtmlListItems(list: DomNode, depth: number, out: ListEntry[]): void {
  const ordered = list.name === 'ol';
  const level = Math.min(depth, MAX_LIST_LEVEL);
  for (const child of listChildren(list)) {
    if (child.type === 'text') {
      // Streutext direkt in der Liste ist ungültiges HTML, aber sichtbar —
      // er wird zu einem eigenen Eintrag statt verworfen.
      const stray = collapse(escapeInline(child.data ?? '')).trim();
      if (stray) out.push({ text: stray, level, ordered });
      continue;
    }
    const name = child.name ?? '';
    if (name === 'ul' || name === 'ol') {
      // Unterliste ohne eigenes `li` davor — eine Ebene tiefer einhängen.
      collectHtmlListItems(child, depth + 1, out);
      continue;
    }
    const { text, nested } = splitListItem(child);
    if (text) out.push({ text, level, ordered });
    for (const sub of nested) collectHtmlListItems(sub, depth + 1, out);
  }
}

function parseSpan(value: string | undefined): number {
  const span = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(span) || span < 1) return 1;
  return Math.min(span, MAX_SPAN);
}

/**
 * Expandiert `rowspan`/`colspan` zu einem Raster: jede Zelle steht in der
 * Spalte, in der sie auch im Browser stünde. Wurden die Attribute ignoriert,
 * rutschte die Folgezeile eines `rowspan` um eine Spalte nach links — der
 * Screenreader las sie dann unter der falschen Kopfzelle vor.
 *
 * Überspannte Plätze werden leer aufgefüllt, nicht dupliziert: eine Wiederholung
 * würde Werte erfinden, die im Original nur einmal stehen.
 */
function tableGrid(table: DomNode): string[][] {
  const trs = childElements(table, ['tr']);
  const grid: string[][] = trs.map(() => []);
  const reserved = trs.map(() => new Set<number>());
  trs.forEach((tr, r) => {
    let col = 0;
    for (const cell of childElements(tr, ['th', 'td'])) {
      while (col < MAX_GRID_COLUMNS && (reserved[r].has(col) || grid[r][col] !== undefined)) {
        col += 1;
      }
      const colspan = parseSpan(cell.attribs?.colspan);
      const rowspan = parseSpan(cell.attribs?.rowspan);
      grid[r][col] = cellText(cell);
      for (let c = col + 1; c < col + colspan; c += 1) grid[r][c] = '';
      for (let rr = r + 1; rr < Math.min(r + rowspan, trs.length); rr += 1) {
        for (let c = col; c < col + colspan; c += 1) reserved[rr].add(c);
      }
      col += colspan;
    }
  });
  return grid.map((row, r) => {
    let width = row.length;
    for (const c of reserved[r]) width = Math.max(width, c + 1);
    const out: string[] = [];
    for (let c = 0; c < width; c += 1) out.push(row[c] ?? '');
    return out;
  });
}

function tableToSink(table: DomNode, sink: BlockSink): void {
  const rows = tableGrid(table);
  if (!rows.length) return;
  const captionNode = childElements(table, ['caption'])[0];
  const caption = captionNode ? cellText(captionNode) : null;
  // `columns` ist Pflicht: ohne <thead>/<th> dient die erste <tr> als Kopf.
  sink.table(rows[0], rows.slice(1), caption);
}

function definitionListToSink(dl: DomNode, sink: BlockSink): void {
  const entries: { label: string; value: string }[] = [];
  let label: string | null = null;
  for (const child of dl.children ?? []) {
    if (!isElement(child)) continue;
    if (child.name === 'dt') {
      if (label !== null) entries.push({ label, value: '' });
      label = cellText(child);
    } else if (child.name === 'dd') {
      entries.push({ label: label ?? '', value: cellText(child) });
      label = null;
    }
  }
  if (label !== null) entries.push({ label, value: '' });
  sink.keyvalue(entries);
}

function htmlNodesToSink(nodes: DomNode[], sink: BlockSink): void {
  // Inline-Inhalt zwischen Blockelementen (typisch für Editor-Exporte ohne
  // sauberes <p>) wird gepuffert und als Absatz abgelegt, statt zu verfallen.
  let buffer = '';
  const flush = (): void => {
    sink.paragraph(collapse(buffer));
    buffer = '';
  };

  for (const node of nodes) {
    if (node.type === 'text') {
      buffer += inlineText(node);
      continue;
    }
    if (!isElement(node)) continue;
    const name = node.name ?? '';
    if (INVISIBLE_TAGS.has(name)) continue;
    if (!BLOCK_TAGS.has(name)) {
      buffer += inlineText(node);
      continue;
    }

    flush();
    switch (name) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        sink.heading(Number(name.slice(1)), collapse(inlineText(node)).replace(/\n/g, ' '));
        break;
      case 'hr':
        sink.divider();
        break;
      case 'p':
        sink.paragraph(collapse(inlineText(node)));
        break;
      case 'blockquote':
        sink.quote(collapse(inlineText(node)));
        break;
      case 'pre':
        sink.note(inlineText(node, true));
        break;
      case 'ul':
      case 'ol': {
        const items: ListEntry[] = [];
        collectHtmlListItems(node, 0, items);
        sink.list(items, name === 'ol');
        break;
      }
      case 'table':
        tableToSink(node, sink);
        break;
      case 'dl':
        definitionListToSink(node, sink);
        break;
      case 'li':
        // Verirrtes <li> ohne Liste — als Absatz retten.
        sink.paragraph(collapse(inlineText(node)));
        break;
      default:
        // Container (div, section, article …): hineinsteigen.
        htmlNodesToSink(node.children ?? [], sink);
        break;
    }
  }
  flush();
}

function htmlToSink(html: string, sink: BlockSink): void {
  const $ = cheerio.load(html);
  const root = $('body')[0] as unknown as DomNode | undefined;
  const nodes = root?.children ?? ($.root()[0] as unknown as DomNode).children ?? [];
  htmlNodesToSink(nodes, sink);
}

export function htmlToBlocks(content: string): PdfBlock[] {
  const sink = new BlockSink();
  htmlToSink(content, sink);
  return sink.blocks;
}

// ── Formaterkennung ──────────────────────────────────────────────────────────

const HTML_BLOCK_TAG_RE =
  /<\/?(?:p|div|h[1-6]|ul|ol|li|table|tr|t[dh]|thead|tbody|blockquote|pre|br|hr|section|article|span|b|strong|em|i)\b[^>]*>/gi;
const MARKDOWN_BLOCK_RE = /^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```|\|.*\|)/gm;

/**
 * `isMarkdownContent` (services/markdown) trägt hier NICHT allein: es prüft nur
 * auf Markdown-Muster und sagt nichts über HTML — ein HTML-Dokument mit einem
 * `*` oder einer Zeile `| a | b |` im Text würde damit als Markdown gelten.
 * Deshalb: HTML nur, wenn es Tags gibt UND entweder gar keine Markdown-Struktur
 * vorliegt oder das Dokument mit einem Tag beginnt (so sehen Editor-Exporte
 * aus). Ein Fehlgriff Richtung Markdown ist harmlos — der Lexer reicht rohes
 * HTML als `html`-Token weiter, das hier wieder im HTML-Pfad landet.
 */
export function looksLikeHtml(content: string): boolean {
  const htmlHits = content.match(HTML_BLOCK_TAG_RE)?.length ?? 0;
  if (!htmlHits) return false;
  const markdownHits = content.match(MARKDOWN_BLOCK_RE)?.length ?? 0;
  return markdownHits === 0 || content.trimStart().startsWith('<');
}

export function contentToBlocks(content: string): PdfBlock[] {
  if (typeof content !== 'string' || !content.trim()) return [EMPTY_FALLBACK];
  const blocks = looksLikeHtml(content) ? htmlToBlocks(content) : markdownToBlocks(content);
  return blocks.length ? blocks : [EMPTY_FALLBACK];
}
