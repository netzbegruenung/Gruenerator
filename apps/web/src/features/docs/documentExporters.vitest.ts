// @vitest-environment jsdom
import { BlockNoteEditor, defaultInlineContentSpecs, type PartialBlock } from '@blocknote/core';
import { docsEditorSchema } from '@gruenerator/docs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createDocxExporter, createOdtExporter } from './documentExporters';

type Schema = typeof docsEditorSchema;
type CustomInlineType = Exclude<
  keyof Schema['inlineContentSchema'],
  keyof typeof defaultInlineContentSpecs
>;

// One sample per custom inline type. A new type in the schema breaks the type
// check here and the key comparison below until it gets a sample (and with it
// an exporter mapping).
const CUSTOM_INLINE_SAMPLES = {
  mention: { type: 'mention', props: { userId: 'u1', userName: 'Erika Muster' } },
} satisfies Record<CustomInlineType, unknown>;

function documentWithEveryCustomType() {
  const editor = BlockNoteEditor.create({ schema: docsEditorSchema });
  const blocks = [
    {
      type: 'paragraph',
      content: ['Hallo ', ...Object.values(CUSTOM_INLINE_SAMPLES), '!'],
    },
  ] as PartialBlock<Schema['blockSchema'], Schema['inlineContentSchema'], Schema['styleSchema']>[];
  editor.replaceBlocks(editor.document, blocks);
  return editor.document;
}

describe('document exporters', () => {
  it('has a sample for every custom inline type of the editor schema', () => {
    const custom = Object.keys(docsEditorSchema.inlineContentSchema).filter(
      (type) => !(type in defaultInlineContentSpecs)
    );
    expect(Object.keys(CUSTOM_INLINE_SAMPLES).sort()).toEqual(custom.sort());
  });

  // transformBlocks is where every inline node is looked up in the mappings;
  // the file packaging after it (fonts, zip) is the same for every document.
  it('exports mentions to DOCX as @name text', async () => {
    const paragraphs = await createDocxExporter().transformBlocks(documentWithEveryCustomType());
    expect(JSON.stringify(paragraphs)).toContain('@Erika Muster');
  });

  it('exports mentions to ODT as @name text', async () => {
    const nodes = await createOdtExporter().transformBlocks(documentWithEveryCustomType());
    expect(renderToStaticMarkup(nodes)).toContain('@Erika Muster');
  });
});
