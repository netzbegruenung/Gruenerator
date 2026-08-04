import { slideBodyExtensions } from '@gruenerator/contracts/presentations-richtext';
import { Collaboration } from '@tiptap/extension-collaboration';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';

import { getBodyFragment } from '../lib/ydocSchema.js';

export interface SlideBodyEditorProps {
  ydoc: Y.Doc;
  slideId: string;
  /**
   * Hands the live editor to the surrounding chrome so the insert toolbar can
   * run commands on it. The toolbar cannot live inside the editor: the slide is
   * rendered at 960×540 and CSS-scaled to fit, so anything drawn in there
   * shrinks with it and is unhittable at typical editor sizes.
   */
  onEditor?: (editor: Editor | null) => void;
}

/**
 * The collaborative slide-body editor: TipTap bound (via y-prosemirror) to the
 * slide's top-level Y.XmlFragment. The editable element carries
 * `gruene-slide__body`, so its `<ul><li>` DOM inherits the deck's variant CSS
 * (dot bullets / cards / numbered circles) live while editing. Real char-level
 * co-editing + undo come from the Collaboration extension — no manual seeding
 * or content syncing here. Mount with `key={slideId}` so it rebinds per slide.
 */
export function SlideBodyEditor({ ydoc, slideId, onEditor }: SlideBodyEditorProps) {
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

  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;
  useEffect(() => {
    onEditorRef.current?.(editor);
    return () => onEditorRef.current?.(null);
  }, [editor]);

  return <EditorContent editor={editor} className="gruene-slide__editor" />;
}
