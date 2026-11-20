import { siteRichTextExtensions } from '@gruenerator/contracts/sites-richtext';
import { Collaboration } from '@tiptap/extension-collaboration';
import { ListKeymap } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';

import type * as Y from 'yjs';

export interface InlineRichTextEditorProps {
  fragment: Y.XmlFragment;
  placeholder: string;
  maxLength: number;
}

/**
 * Rich text edited in place on the page, bound to the draft's Y.XmlFragment like the sidebar
 * editor. No chrome of its own: it inherits the page's typography inside the preview frame.
 */
export default function InlineRichTextEditor({
  fragment,
  placeholder,
  maxLength,
}: InlineRichTextEditorProps) {
  const editor = useEditor(
    {
      extensions: [
        ...siteRichTextExtensions,
        ListKeymap,
        Placeholder.configure({ placeholder }),
        CharacterCount.configure({ limit: maxLength }),
        Collaboration.configure({ fragment }),
      ],
      // Tiptap would inject its base CSS into the host document, not into the preview frame;
      // the frame carries the needed rules itself (SitePreviewFrame).
      injectCSS: false,
      editorProps: { attributes: { 'aria-label': placeholder, 'data-inline-edit': '' } },
      immediatelyRender: true,
    },
    [fragment]
  );
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
