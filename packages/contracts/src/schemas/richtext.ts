/**
 * Rich-text content for the candidate-site builder, stored as a restricted
 * ProseMirror/Tiptap JSON document. The whitelist below is the single source
 * of truth for what renderers accept; the Tiptap editor config that produces
 * these docs lives in packages/sites (RichTextEditor.tsx) and must stay
 * aligned — anything outside this schema is rejected at the API boundary.
 * This module is pure Zod/TS (no tiptap) and safe for every bundle.
 */
import { z } from 'zod';

export const RICH_TEXT_MARK_TYPES = ['bold', 'italic', 'underline'] as const;
export const RICH_TEXT_NODE_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'text',
  'hardBreak',
] as const;

export interface RichTextMark {
  type: (typeof RICH_TEXT_MARK_TYPES)[number];
}

export interface RichTextNode {
  type: (typeof RICH_TEXT_NODE_TYPES)[number];
  attrs?: Record<string, unknown> | undefined;
  marks?: RichTextMark[] | undefined;
  text?: string | undefined;
  content?: RichTextNode[] | undefined;
}

export interface RichTextDoc {
  type: 'doc';
  content?: RichTextNode[] | undefined;
}

export const richTextMarkSchema: z.ZodType<RichTextMark> = z.object({
  type: z.enum(RICH_TEXT_MARK_TYPES),
});

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: z.enum(RICH_TEXT_NODE_TYPES),
      attrs: z.record(z.string(), z.unknown()).optional(),
      marks: z.array(richTextMarkSchema).optional(),
      text: z.string().optional(),
      content: z.array(richTextNodeSchema).optional(),
    })
    .superRefine((node, ctx) => {
      if (node.type === 'heading') {
        const level = node.attrs?.['level'];
        if (level !== 2 && level !== 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'heading level must be 2 or 3',
          });
        }
      }
    })
);

export const richTextDocSchema: z.ZodType<RichTextDoc> = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema).optional(),
});

export const SITE_ABOUT_MAX_LENGTH = 1000;
export const SITE_THEME_CONTENT_MAX_LENGTH = 250;

/**
 * Plain-text length of a doc, matching Tiptap CharacterCount semantics
 * (`textBetween(0, size, undefined, ' ')`): inline text concatenated, leaf
 * blocks joined by a single space. Keep in sync with the client-side counter.
 */
export function getRichTextLength(doc: RichTextDoc): number {
  const blockTexts: string[] = [];
  const collect = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        if (blockTexts.length === 0) blockTexts.push('');
        blockTexts[blockTexts.length - 1] += node.text ?? '';
      } else if (node.type === 'paragraph' || node.type === 'heading') {
        blockTexts.push('');
        if (node.content) collect(node.content);
      } else if (node.content) {
        collect(node.content);
      }
    }
  };
  collect(doc.content ?? []);
  return blockTexts.join(' ').length;
}

export function isRichTextDocEmpty(doc: RichTextDoc | null | undefined): boolean {
  if (!doc) return true;
  return getRichTextLength(doc) === 0;
}

export function emptyRichTextDoc(): RichTextDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Blank-line-separated plain text (e.g. AI-generated copy) → doc. */
export function richTextDocFromPlainText(text: string): RichTextDoc {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph): RichTextNode => {
      const lines = paragraph.split('\n');
      const content: RichTextNode[] = [];
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' });
        if (line) content.push({ type: 'text', text: line });
      });
      return { type: 'paragraph', content };
    });
  return { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
}

export const boundedRichTextDoc = (maxLength: number) =>
  richTextDocSchema.superRefine((doc, ctx) => {
    const length = getRichTextLength(doc);
    if (length > maxLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `content exceeds ${maxLength} characters (got ${length})`,
      });
    }
  });

// ── HTML rendering (server-side) ─────────────────────────────────────────────
// Hand-rolled over the closed schema instead of @tiptap/static-renderer so
// contracts stays tiptap-free. The switches are exhaustive over the node/mark
// unions: extending the schema fails compilation here until handled.

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWithMarks(marks: RichTextMark[] | undefined, html: string): string {
  return (marks ?? []).reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${acc}</strong>`;
      case 'italic':
        return `<em>${acc}</em>`;
      case 'underline':
        return `<u>${acc}</u>`;
      default: {
        const exhaustive: never = mark.type;
        return exhaustive;
      }
    }
  }, html);
}

function renderNodeToHTML(node: RichTextNode): string {
  const children = (node.content ?? []).map(renderNodeToHTML).join('');
  switch (node.type) {
    case 'text':
      return wrapWithMarks(node.marks, escapeHtmlText(node.text ?? ''));
    case 'hardBreak':
      return '<br>';
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'heading':
      return node.attrs?.['level'] === 2 ? `<h2>${children}</h2>` : `<h3>${children}</h3>`;
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList':
      return `<ol>${children}</ol>`;
    case 'listItem':
      return `<li>${children}</li>`;
    default: {
      const exhaustive: never = node.type;
      return exhaustive;
    }
  }
}

/** Doc → HTML string for server-side page rendering. Text is entity-escaped. */
export function renderRichTextToHTMLString(doc: RichTextDoc): string {
  return (doc.content ?? []).map(renderNodeToHTML).join('');
}
