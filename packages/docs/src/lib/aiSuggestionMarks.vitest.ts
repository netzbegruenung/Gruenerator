// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { AIExtension } from '@blocknote/xl-ai';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Guards patches/@blocknote__xl-ai@0.56.0.patch (GlitchTip #702/#703).
 *
 * xl-ai's agent marks its preview with `pmSchema.mark('insertion', {})`, so the
 * mark carries the default `id: null`. When the user types inside that preview,
 * ProseMirror re-parses the DOM and recreates the mark from its own attrs, now
 * passing `id: null` explicitly — which the upstream `validate: "number"`
 * rejects with "Expected value of type number for attribute id on type
 * insertion, got null". If this fails after a BlockNote upgrade, the patch did
 * not carry over.
 */

type Kind = 'insertion' | 'deletion';

let editor: BlockNoteEditor | undefined;

afterEach(() => {
  editor?.unmount();
  editor = undefined;
});

function markedEditor(kind: Kind) {
  editor = BlockNoteEditor.create({ extensions: [AIExtension()] });
  editor.mount(document.createElement('div'));
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: [{ type: 'text', text: 'Vorschlag', styles: {} }] },
  ]);

  const view = editor.prosemirrorView!;
  let from = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && from < 0) from = pos;
  });
  // Exactly what xl-ai's agent does for its preview marks (agent.ts).
  const mark = view.state.schema.mark(kind, {});
  view.dispatch(view.state.tr.addMark(from, from + 'Vorschlag'.length, mark));
  return { view, mark };
}

describe('AI suggestion marks without an id', () => {
  it.each<Kind>(['insertion', 'deletion'])('agent %s marks are created with id null', (kind) => {
    const { mark } = markedEditor(kind);
    expect(mark.attrs.id).toBeNull();
  });

  it.each<Kind>(['insertion', 'deletion'])(
    'recreating a %s mark from its own attrs (the DOM re-parse path) does not throw',
    (kind) => {
      const { mark } = markedEditor(kind);
      expect(() => mark.type.create(mark.attrs)).not.toThrow();
    }
  );

  it.each<Kind>(['insertion', 'deletion'])(
    'typing inside a %s preview is read back into the doc',
    (kind) => {
      const { view } = markedEditor(kind);
      const tag = kind === 'insertion' ? 'ins' : 'del';
      const textNode = view.dom.querySelector(tag)?.firstChild;
      expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

      (textNode as Text).data = 'Vorschlagx';
      // DOMObserver.flush() → readDOMChange → DOMParser.parse: the stack from
      // the GlitchTip events. Internal API, hence the cast.
      const { domObserver } = view as unknown as { domObserver: { flush(): void } };
      expect(() => domObserver.flush()).not.toThrow();
      expect(view.state.doc.textContent).toContain('Vorschlagx');
    }
  );
});
