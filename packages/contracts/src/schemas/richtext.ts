// Moved to @ggraphic/schema (ggraphic plan, phase 1 step 5); kept so existing imports resolve.
export {
  RICH_TEXT_MARK_TYPES,
  RICH_TEXT_NODE_TYPES,
  SITE_ABOUT_MAX_LENGTH,
  SITE_THEME_CONTENT_MAX_LENGTH,
  boundedRichTextDoc,
  emptyRichTextDoc,
  getRichTextLength,
  isRichTextDocEmpty,
  richTextDocFromPlainText,
  richTextDocSchema,
  richTextMarkSchema,
  richTextNodeSchema,
} from '@ggraphic/schema';
export type { RichTextDoc, RichTextMark, RichTextNode } from '@ggraphic/schema';
