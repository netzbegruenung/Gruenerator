/**
 * Rich-text content for the candidate-site builder, stored as a restricted
 * ProseMirror/Tiptap JSON document. The whitelist below is the single source
 * of truth for what the editor may produce and what the renderers accept;
 * the matching Tiptap extension list lives in `../richtext/index.ts`
 * (subpath export `@gruenerator/contracts/sites-richtext` — tiptap-free here
 * so this module stays safe for the mobile bundle).
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

/**
 * The document shape is generic over its marks: site content uses the
 * whitelist above; the canvas text bridge (`text/canvasRichText.ts`) adds its
 * own `accent` mark without widening what a site may store.
 */
export interface RichTextMark<T extends string = (typeof RICH_TEXT_MARK_TYPES)[number]> {
  type: T;
}

export interface RichTextNode<M extends RichTextMark<string> = RichTextMark> {
  type: (typeof RICH_TEXT_NODE_TYPES)[number];
  attrs?: Record<string, unknown> | undefined;
  marks?: M[] | undefined;
  text?: string | undefined;
  content?: RichTextNode<M>[] | undefined;
}

export interface RichTextDoc<M extends RichTextMark<string> = RichTextMark> {
  type: 'doc';
  content?: RichTextNode<M>[] | undefined;
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
