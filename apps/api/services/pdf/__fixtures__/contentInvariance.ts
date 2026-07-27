/**
 * Content-invariance harness for the document export.
 *
 * The dangerous failure when swapping PDF renderers is not a crash, it is text
 * that silently never reaches the page. So we measure one property and only
 * that one: every visible word of the source must appear in the text layer of
 * the finished PDF.
 */

import * as cheerio from 'cheerio';
import { marked } from 'marked';

export type FixtureKind = 'markdown' | 'html';

export const EXPORT_FIXTURES: { name: string; file: string; kind: FixtureKind }[] = [
  { name: 'markdown-basic', file: 'markdown-basic.md', kind: 'markdown' },
  { name: 'markdown-table', file: 'markdown-table.md', kind: 'markdown' },
  { name: 'markdown-nested-list', file: 'markdown-nested-list.md', kind: 'markdown' },
  { name: 'html-blocknote', file: 'html-blocknote.html', kind: 'html' },
  { name: 'html-messy', file: 'html-messy.html', kind: 'html' },
  { name: 'edge-empty', file: 'edge-empty.md', kind: 'markdown' },
  { name: 'edge-long-word', file: 'edge-long-word.md', kind: 'markdown' },
  { name: 'edge-umlaute-emoji', file: 'edge-umlaute-emoji.md', kind: 'markdown' },
  { name: 'edge-huge', file: 'edge-huge.md', kind: 'markdown' },
  { name: 'edge-code-quote', file: 'edge-code-quote.md', kind: 'markdown' },
];

/** Minimal view of a domhandler node — cheerio's own node types are not a direct dependency. */
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
}

const SKIPPED_TAGS = new Set(['script', 'style', 'head']);

/**
 * Collect decoded text nodes separately instead of calling `.text()`:
 * `.text()` concatenates `<td>A</td><td>B</td>` into "AB" and would invent words.
 */
function collectText(nodes: DomNode[], out: string[]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.data) out.push(node.data);
      continue;
    }
    if (node.name && SKIPPED_TAGS.has(node.name)) continue;
    if (node.children) collectText(node.children, out);
  }
}

function htmlToVisibleText(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  collectText($.root().toArray() as unknown as DomNode[], parts);
  return parts.join(' ');
}

/** A token counts as a word only if it carries a letter or a digit. */
function normalizeToken(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const word = normalizeToken(raw);
    if (word && /[\p{L}\p{N}]/u.test(word)) out.push(word);
  }
  return out;
}

/**
 * Zweites, bewusst dummes Orakel: Markup per Regex wegschneiden, sonst nichts.
 *
 * Das erste Orakel benutzt marked/cheerio — dieselben Bibliotheken wie der
 * Konverter. Jeder Verlust INNERHALB dieser Bibliotheken wäre damit per
 * Konstruktion unsichtbar, und genau das ist passiert: marked verwarf in einer
 * Markdown-Tabelle die Zellen jenseits der Kopfzeilenbreite, und weil das
 * Orakel dieselbe Verwerfung vornahm, meldete der Test null Verluste.
 */
function crudeWords(source: string, kind: 'markdown' | 'html'): string[] {
  const stripped =
    kind === 'html'
      ? source
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      : source
          .replace(/^```[^\n]*$/gm, ' ')
          .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/[|>#*_`~-]/g, ' ');
  return tokenize(stripped);
}

/**
 * Visible words of the source — markup removed, content kept: link text yes,
 * URL no; table cell yes, pipe no.
 *
 * Returns a MULTISET, not a set: with deduplication a word that vanishes in one
 * place but survives in another is invisible. `edge-huge.md` shrank from 4567
 * tokens to 150 distinct ones — 97 % of the document could have disappeared
 * without turning the test red.
 *
 * Two independent oracles are unioned; see {@link crudeWords} for why one is
 * not enough. Symbols and emoji are deliberately out of scope: the renderer is
 * allowed to substitute them (`→` becomes `->`), so their absence is not proof
 * of loss.
 */
export function visibleWords(source: string, kind: 'markdown' | 'html'): string[] {
  const html = kind === 'markdown' ? (marked.parse(source, { async: false }) as string) : source;
  const parsed = tokenize(htmlToVisibleText(html));

  // Vereinigung als Multiset: je Wort die höhere der beiden Häufigkeiten.
  const counts = new Map<string, number>();
  const tally = (words: string[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const word of words) map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  };
  const crude = tally(crudeWords(source, kind));
  for (const [word, n] of tally(parsed)) counts.set(word, n);
  for (const [word, n] of crude) counts.set(word, Math.max(counts.get(word) ?? 0, n));

  const out: string[] = [];
  for (const [word, n] of counts) for (let i = 0; i < n; i++) out.push(word);
  return out;
}

/** Text layer of the finished PDF, the way a screen reader sees it. */
export async function pdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  try {
    const doc = await task.promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) parts.push(item.str);
      }
    }
    return parts.join(' ');
  } finally {
    await task.destroy();
  }
}

/**
 * Which words never made it into the PDF? Only this direction is checked —
 * title, date and footer are legitimate additions by the renderer.
 *
 * Both sides are stripped of ALL whitespace first: a very long word gets hard
 * wrapped and pdfjs then returns it as several items, which a naive comparison
 * would report as lost. Case is folded because a renderer may set a heading in
 * capitals without losing content.
 */
export function missingWords(words: string[], pdf: string): string[] {
  const haystack = pdf.replace(/\s+/gu, '').toLowerCase();
  // Häufigkeit zählen statt nur Vorhandensein: dreimal "Vergabe" in der Quelle
  // und einmal im PDF ist zweifacher Verlust, den eine reine Enthaltensein-
  // Prüfung als grün meldet.
  const needed = new Map<string, number>();
  for (const word of words) {
    const key = word.replace(/\s+/gu, '').toLowerCase();
    if (key) needed.set(key, (needed.get(key) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const [key, wanted] of needed) {
    let found = 0;
    for (let at = haystack.indexOf(key); at !== -1; at = haystack.indexOf(key, at + 1)) {
      found += 1;
      if (found >= wanted) break;
    }
    for (let i = found; i < wanted; i++) missing.push(key);
  }
  return missing;
}
