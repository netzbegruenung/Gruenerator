/**
 * Presentation slide-body rich text — shared, DOM-free, client + server.
 *
 * The slide body is edited collaboratively as a ProseMirror document bound to a
 * per-slide `Y.XmlFragment` (TipTap + y-prosemirror). This module is the single
 * source of truth for the editor's schema plus the conversions the rest of the
 * stack needs:
 *   - markdown → PM JSON      (seed a fragment from AI ops / generated decks)
 *   - PM JSON  → markdown      (derive the read-model body for static render,
 *                               AI context, and PPTX export)
 *   - fragment ⇄ markdown      (thin wrappers over the above + y-prosemirror)
 *
 * Subpath export ONLY (`@gruenerator/contracts/presentations-richtext`). Never
 * re-export from `src/index.ts`: apps/mobile consumes the main export and Metro
 * would pull tiptap + y-prosemirror into the mobile bundle.
 */
import { getSchema } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Image } from '@tiptap/extension-image';
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Text } from '@tiptap/extension-text';
import { marked, type Token, type Tokens } from 'marked';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { type XmlFragment } from 'yjs';

/**
 * The slide-body editor schema: paragraphs + bullet/ordered lists + tables +
 * images + bold / italic, no headings (the slide title is a separate field).
 * The editable element inherits `.gruene-slide__body`, so its `<ul><li>` and
 * `<table>` DOM picks up the deck's variant CSS live.
 *
 * `resizable` stays off: it mounts a node view and a ProseMirror plugin, and
 * this schema is also built on the server. Column widths are a follow-up for
 * the editor package, not a property of the shared document.
 *
 * Images are block-level (`inline: false`) — a slide image is its own element,
 * never a character inside a sentence — and base64 sources stay rejected so a
 * pasted data URL never lands in the CRDT.
 */
export const slideBodyExtensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  BulletList,
  OrderedList,
  ListItem,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Image,
];

/** ProseMirror schema built from the extensions (DOM-free — safe on the server). */
export const slideBodySchema = getSchema(slideBodyExtensions);

/** Top-level Y.XmlFragment key for a slide's collaborative body. */
export function bodyFragmentKey(slideId: string): string {
  return `slide-body:${slideId}`;
}

// ── markdown → ProseMirror JSON ──────────────────────────────────────────────

interface PMMark {
  type: string;
}
interface PMNode {
  type: string;
  text?: string;
  content?: PMNode[];
  marks?: PMMark[];
  attrs?: Record<string, unknown>;
}

function textNode(text: string, marks: string[]): PMNode[] {
  if (!text) return [];
  const node: PMNode = { type: 'text', text };
  if (marks.length) node.marks = marks.map((m) => ({ type: m }));
  return [node];
}

function inlineToPM(tokens: Token[] | undefined, marks: string[]): PMNode[] {
  const out: PMNode[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
      case 'escape': {
        const inner = (t as Tokens.Text).tokens;
        if (inner?.length) out.push(...inlineToPM(inner, marks));
        else out.push(...textNode((t as Tokens.Text).text, marks));
        break;
      }
      case 'strong':
        out.push(...inlineToPM((t as Tokens.Strong).tokens, [...marks, 'bold']));
        break;
      case 'em':
        out.push(...inlineToPM((t as Tokens.Em).tokens, [...marks, 'italic']));
        break;
      case 'codespan':
        out.push(...textNode((t as Tokens.Codespan).text, marks));
        break;
      case 'link':
        out.push(...inlineToPM((t as Tokens.Link).tokens, marks));
        break;
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      case 'html':
        // A table cell can't span lines, so `serializeCell` writes hard breaks
        // as `<br>`. Read them back rather than printing the tag as text.
        if (/^<br\s*\/?>$/i.test((t as Tokens.HTML).raw.trim())) out.push({ type: 'hardBreak' });
        break;
      default: {
        const text = (t as { text?: string }).text;
        if (text) out.push(...textNode(text, marks));
      }
    }
  }
  return out;
}

function paragraph(content: PMNode[]): PMNode {
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function itemToPM(item: Tokens.ListItem): PMNode {
  const content: PMNode[] = [];
  let para: PMNode[] = [];
  const flush = () => {
    if (para.length) {
      content.push(paragraph(para));
      para = [];
    }
  };
  for (const tk of item.tokens ?? []) {
    if (tk.type === 'list') {
      flush();
      content.push(listToPM(tk as Tokens.List));
    } else if (tk.type === 'text') {
      para.push(...inlineToPM((tk as Tokens.Text).tokens ?? [tk], []));
    } else {
      para.push(...inlineToPM([tk], []));
    }
  }
  flush();
  // ProseMirror listItem must lead with a block; guarantee a paragraph first.
  if (!content.length || content[0]!.type !== 'paragraph') content.unshift({ type: 'paragraph' });
  return { type: 'listItem', content };
}

function listToPM(token: Tokens.List): PMNode {
  return {
    type: token.ordered ? 'orderedList' : 'bulletList',
    content: token.items.map(itemToPM),
  };
}

const CELL_ALIGNMENTS = ['left', 'center', 'right'] as const;

type CellAlign = (typeof CELL_ALIGNMENTS)[number];

function normalizeAlign(value: unknown): CellAlign | null {
  return CELL_ALIGNMENTS.includes(value as CellAlign) ? (value as CellAlign) : null;
}

function cellToPM(cell: Tokens.TableCell, align: CellAlign | null, header: boolean): PMNode {
  const node: PMNode = {
    type: header ? 'tableHeader' : 'tableCell',
    content: [paragraph(inlineToPM(cell.tokens, []))],
  };
  if (align) node.attrs = { align };
  return node;
}

/**
 * A markdown table → a ProseMirror table. Column alignment lives on the table
 * token (`align[i]`), not on the cell, so it is threaded in per index; marked's
 * `splitCells` has already turned `\|` back into a literal pipe by this point
 * (`serializeCell` is what writes the escape).
 */
function tableToPM(token: Tokens.Table): PMNode {
  const align = Array.isArray(token.align) ? token.align : [];
  const rows: PMNode[] = [];
  if (token.header.length) {
    rows.push({
      type: 'tableRow',
      content: token.header.map((cell, i) => cellToPM(cell, normalizeAlign(align[i]), true)),
    });
  }
  for (const row of token.rows) {
    rows.push({
      type: 'tableRow',
      content: row.map((cell, i) => cellToPM(cell, normalizeAlign(align[i]), false)),
    });
  }
  return { type: 'table', content: rows };
}

function imageToPM(token: Tokens.Image): PMNode {
  const attrs: Record<string, unknown> = { src: token.href, alt: token.text || null };
  if (token.title) attrs['title'] = token.title;
  return { type: 'image', attrs };
}

/**
 * A markdown paragraph → one or more blocks. Slide images are block-level (see
 * `slideBodyExtensions`), but markdown puts `![…](…)` inline, so a paragraph
 * mixing prose and images is split: each image becomes its own block and the
 * prose around it keeps its paragraphs.
 */
function paragraphToPM(tokens: Token[] | undefined): PMNode[] {
  const out: PMNode[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (!run.length) return;
    const content = inlineToPM(run, []);
    if (content.length) out.push(paragraph(content));
    run = [];
  };
  for (const t of tokens ?? []) {
    if (t.type === 'image') {
      flush();
      out.push(imageToPM(t as Tokens.Image));
    } else {
      run.push(t);
    }
  }
  flush();
  return out.length ? out : [paragraph([])];
}

function blockToPM(token: Token): PMNode[] {
  switch (token.type) {
    case 'list':
      return [listToPM(token as Tokens.List)];
    case 'table':
      return [tableToPM(token as Tokens.Table)];
    case 'space':
      return [];
    case 'paragraph':
    case 'heading':
    case 'text':
      return paragraphToPM((token as Tokens.Paragraph).tokens);
    default: {
      const text = (token as { text?: string }).text;
      return text ? [paragraph(textNode(text, []))] : [];
    }
  }
}

/** Markdown → ProseMirror JSON (`doc`). Always returns a schema-valid doc. */
export function markdownToPMJSON(md: string): PMNode {
  const content: PMNode[] = [];
  for (const token of marked.lexer(md ?? '')) content.push(...blockToPM(token));
  if (!content.length) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

// ── ProseMirror JSON → markdown ──────────────────────────────────────────────

function serializeInline(nodes: PMNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text') return '';
      let t = n.text ?? '';
      const marks = n.marks?.map((m) => m.type) ?? [];
      if (marks.includes('bold')) t = `**${t}**`;
      if (marks.includes('italic')) t = `*${t}*`;
      return t;
    })
    .join('');
}

function serializeList(list: PMNode, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  return (list.content ?? [])
    .map((li, i) => {
      const marker = ordered ? `${i + 1}.` : '-';
      let firstLine = '';
      const rest: string[] = [];
      (li.content ?? []).forEach((child, idx) => {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          rest.push(serializeList(child, child.type === 'orderedList', depth + 1));
        } else {
          const text = serializeInline(child.content);
          if (idx === 0) firstLine = text;
          else rest.push(`${indent}  ${text}`);
        }
      });
      return `${indent}${marker} ${firstLine}${rest.length ? `\n${rest.join('\n')}` : ''}`;
    })
    .join('\n');
}

function serializeImage(node: PMNode): string {
  const src = String(node.attrs?.['src'] ?? '');
  const alt = String(node.attrs?.['alt'] ?? '');
  const title = node.attrs?.['title'] ? String(node.attrs['title']) : '';
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

/**
 * One table cell → its markdown text. A cell has to stay on one line and inside
 * one column, so hard breaks become `<br>` (read back by `inlineToPM`) and a
 * literal pipe is escaped (marked's `splitCells` unescapes it again).
 */
function serializeCell(cell: PMNode): string {
  return (cell.content ?? [])
    .map((block) => serializeInline(block.content))
    .join(' ')
    .replace(/\s*\n\s*/g, '<br>')
    .replace(/(?<!\\)\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIGN_RULE: Record<CellAlign, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

/**
 * A ProseMirror table → a GFM pipe table. GFM has no table without a header
 * row, so a body-only table gets an empty one — that keeps it a table on the
 * way back in instead of degrading to paragraphs.
 */
function serializeTable(node: PMNode): string {
  const rows = (node.content ?? []).map((row) => row.content ?? []);
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!columns) return '';

  const aligns: (CellAlign | null)[] = Array.from({ length: columns }, (_, i) => {
    for (const row of rows) {
      const align = normalizeAlign(row[i]?.attrs?.['align']);
      if (align) return align;
    }
    return null;
  });

  const line = (cells: PMNode[]) =>
    `| ${Array.from({ length: columns }, (_, i) => (cells[i] ? serializeCell(cells[i]!) : '')).join(' | ')} |`;

  const hasHeader = rows[0]?.some((cell) => cell.type === 'tableHeader') ?? false;
  const header: PMNode[] = hasHeader ? rows[0]! : [];
  const body = hasHeader ? rows.slice(1) : rows;

  return [
    line(header),
    `| ${aligns.map((a) => (a ? ALIGN_RULE[a] : '---')).join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

/** ProseMirror JSON (`doc`) → markdown. */
export function pmJSONToMarkdown(doc: unknown): string {
  // Boundary cast: we only read the closed node set the slide-body schema
  // produces (paragraph, bullet/ordered list, list item, table, image, text +
  // bold/italic).
  const root = doc as PMNode;
  const blocks: string[] = [];
  for (const node of root.content ?? []) {
    if (node.type === 'bulletList') blocks.push(serializeList(node, false, 0));
    else if (node.type === 'orderedList') blocks.push(serializeList(node, true, 0));
    else if (node.type === 'table') blocks.push(serializeTable(node));
    else if (node.type === 'image') blocks.push(serializeImage(node));
    else blocks.push(serializeInline(node.content));
  }
  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── fragment ⇄ markdown ──────────────────────────────────────────────────────

/**
 * Replace a fragment's content with the ProseMirror rendering of `md`. Call
 * inside a `ydoc.transact(..., origin)` so it syncs and is attributed.
 */
export function seedFragmentFromMarkdown(fragment: XmlFragment, md: string): void {
  if (fragment.length) fragment.delete(0, fragment.length);
  prosemirrorJSONToYXmlFragment(slideBodySchema, markdownToPMJSON(md), fragment);
}

/** Derive the markdown read-model from a collaborative body fragment. */
export function fragmentToMarkdown(fragment: XmlFragment | null | undefined): string {
  if (!fragment || fragment.length === 0) return '';
  return pmJSONToMarkdown(yXmlFragmentToProsemirrorJSON(fragment));
}
