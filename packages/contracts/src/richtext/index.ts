/**
 * Tiptap extension config + server-side HTML renderer for site rich text.
 *
 * Subpath export ONLY (`@gruenerator/contracts/sites-richtext`). Never
 * re-export this module from `src/index.ts`: apps/mobile consumes the main
 * export and Metro would pull the whole tiptap dependency tree into the
 * mobile bundle. The pure-Zod schema counterpart lives in
 * `../schemas/richtext.ts`.
 */
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Heading } from '@tiptap/extension-heading';
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';

import { type RichTextDoc } from '../schemas/richtext.js';

export const siteRichTextExtensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Heading.configure({ levels: [2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
];

/** PM JSON → HTML for server-side rendering. Text nodes are entity-escaped by the static renderer. */
export function renderRichTextToHTMLString(doc: RichTextDoc): string {
  // Boundary cast: tiptap's JSONContent lacks `| undefined` on its optional
  // props, which exactOptionalPropertyTypes treats as incompatible.
  return renderToHTMLString({
    extensions: siteRichTextExtensions,
    content: doc as Parameters<typeof renderToHTMLString>[0]['content'],
  });
}
