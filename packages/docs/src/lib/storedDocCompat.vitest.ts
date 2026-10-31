// @vitest-environment jsdom
import {
  BlockNoteEditor,
  BlockNoteSchema,
  createInlineContentSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { withCollaboration } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import fixture055 from './__fixtures__/yjsDoc-blocknote-0.55.json';

/**
 * Every stored document was written by an older BlockNote. Opening it in the
 * current one must not change it: y-prosemirror writes whatever the editor
 * normalises straight back into the shared Y.Doc, so a schema change that drops
 * or rewrites a node on load would rewrite the document for every collaborator,
 * and the next store persists it. The fixture covers every block, style and
 * inline type our schema allows (nesting, toggles, tables with spans and
 * colours, code with and without language, media, mention), written by 0.55.
 *
 * When a BlockNote upgrade turns this red, stop and find out what changed in
 * the stored shape before shipping — do not regenerate the fixture to make it
 * pass. Add a fixture for the new version next to it instead.
 */

// Same ProseMirror node as Mention.tsx; the React render is not needed here.
const Mention = createInlineContentSpec(
  {
    type: 'mention',
    propSchema: { userId: { default: '' }, userName: { default: 'Unbekannt' } },
    content: 'none',
  },
  {
    render: (ic) => {
      const span = document.createElement('span');
      span.textContent = `@${ic.props.userName}`;
      return { dom: span };
    },
  }
);

const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  styleSpecs: defaultStyleSpecs,
});

function fakeAwareness() {
  const states = new Map<number, Record<string, unknown>>();
  let local: Record<string, unknown> = {};
  return {
    getStates: () => states,
    getLocalState: () => local,
    setLocalStateField: (k: string, v: unknown) => {
      local = { ...local, [k]: v };
    },
    on: () => {},
    off: () => {},
  };
}

const editors: BlockNoteEditor<any, any, any>[] = [];

afterEach(() => {
  editors.splice(0).forEach((e) => e.unmount());
});

// The fixture went through JSON, so `undefined` fields are gone and sparse
// column widths are `null`; compare the editor's blocks in the same form.
const asStored = (blocks: unknown) => JSON.parse(JSON.stringify(blocks)) as unknown;

function openStored(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const fragment = doc.getXmlFragment(fixture055.fragment);
  const xmlBefore = fragment.toString();
  const writes: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => writes.push(u));

  const editor = BlockNoteEditor.create(
    withCollaboration({
      schema,
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      collaboration: {
        fragment,
        user: { name: 'Test User', color: '#FF0000' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: { awareness: fakeAwareness() } as any,
      },
    })
  );
  editors.push(editor);
  editor.mount(document.createElement('div'));
  return { doc, fragment, editor, xmlBefore, writes };
}

describe('documents stored by an older BlockNote', () => {
  const update = new Uint8Array(Buffer.from(fixture055.update, 'base64'));

  it(`opens a ${fixture055.writtenBy} document without writing to it`, async () => {
    const { fragment, xmlBefore, writes } = openStored(update);
    await new Promise((r) => setTimeout(r, 50));

    expect(writes).toHaveLength(0);
    expect(fragment.toString()).toBe(xmlBefore);
  });

  it(`reads every block of a ${fixture055.writtenBy} document unchanged`, () => {
    const { editor } = openStored(update);
    expect(asStored(editor.document)).toEqual(fixture055.blocks);
  });

  it('an edit by the current version keeps the stored blocks intact', () => {
    const { doc, editor } = openStored(update);
    editor.insertBlocks(
      [{ type: 'paragraph', content: 'Neu' }],
      editor.document[editor.document.length - 1],
      'after'
    );

    const reopened = openStored(Y.encodeStateAsUpdate(doc)).editor.document;
    expect(asStored(reopened.slice(0, fixture055.blocks.length))).toEqual(fixture055.blocks);
    expect(reopened).toHaveLength(fixture055.blocks.length + 1);
  });
});
