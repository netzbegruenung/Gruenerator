import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';

import { Mention } from './Mention';

// Every custom type added here needs a mapping in the DOCX/ODT exporters
// (apps/web/src/features/docs/documentExporters.ts), or the export throws.
export const docsEditorSchema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
  },
  styleSpecs: defaultStyleSpecs,
});
