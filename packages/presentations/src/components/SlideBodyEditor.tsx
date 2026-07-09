import { slideBodyExtensions } from '@gruenerator/contracts/presentations-richtext';
import { Collaboration } from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';
import * as Y from 'yjs';

import { getBodyFragment } from '../lib/ydocSchema.js';

export interface SlideBodyEditorProps {
  ydoc: Y.Doc;
  slideId: string;
}

/**
 * The collaborative slide-body editor: TipTap bound (via y-prosemirror) to the
 * slide's top-level Y.XmlFragment. The editable element carries
 * `gruene-slide__body`, so its `<ul><li>` DOM inherits the deck's variant CSS
 * (dot bullets / cards / numbered circles) live while editing. Real char-level
 * co-editing + undo come from the Collaboration extension — no manual seeding
 * or content syncing here. Mount with `key={slideId}` so it rebinds per slide.
 */
export function SlideBodyEditor({ ydoc, slideId }: SlideBodyEditorProps) {
  const fragment = useMemo(() => getBodyFragment(ydoc, slideId), [ydoc, slideId]);
  const editor = useEditor(
    {
      extensions: [...slideBodyExtensions, Collaboration.configure({ fragment })],
      editorProps: {
        attributes: { class: 'gruene-slide__body', 'data-placeholder': 'Inhalt …' },
      },
      immediatelyRender: true,
    },
    [fragment]
  );

  return <EditorContent editor={editor} className="gruene-slide__editor" />;
}
