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
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { marked, type Token, type Tokens } from 'marked';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import { type XmlFragment } from 'yjs';

/**
 * The slide-body editor schema: paragraphs + bullet/ordered lists + bold /
 * italic, no headings (the slide title is a separate field). The editable
 * element inherits `.gruene-slide__body`, so its `<ul><li>` DOM picks up the
 * deck's variant CSS (dot bullets / cards / numbered circles) live.
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

function blockToPM(token: Token): PMNode[] {
  switch (token.type) {
    case 'list':
      return [listToPM(token as Tokens.List)];
    case 'space':
      return [];
    case 'paragraph':
    case 'heading':
    case 'text':
      return [paragraph(inlineToPM((token as Tokens.Paragraph).tokens, []))];
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

/** ProseMirror JSON (`doc`) → markdown. */
export function pmJSONToMarkdown(doc: unknown): string {
  // Boundary cast: we only read the closed node set the slide-body schema
  // produces (paragraph, bullet/ordered list, list item, text + bold/italic).
  const root = doc as PMNode;
  const blocks: string[] = [];
  for (const node of root.content ?? []) {
    if (node.type === 'bulletList') blocks.push(serializeList(node, false, 0));
    else if (node.type === 'orderedList') blocks.push(serializeList(node, true, 0));
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
