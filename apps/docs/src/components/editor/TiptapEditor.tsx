import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { EditorToolbar } from './EditorToolbar';
import './TiptapEditor.css';

interface TiptapEditorProps {
  documentId: string;
  initialContent?: string;
  onUpdate?: (content: string) => void;
  editable?: boolean;
  ydoc?: Y.Doc;
  provider?: WebsocketProvider | null;
}

export const TiptapEditor = ({
  documentId,
  initialContent = '',
  onUpdate,
  editable = true,
  ydoc,
  provider,
  onEditorReady
}: TiptapEditorProps & { onEditorReady?: (editor: any) => void }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable history when using collaboration (Y.js handles it)
        history: ydoc ? false : undefined,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
      Placeholder.configure({
        placeholder: 'Beginne zu schreiben...',
      }),
      // Add collaboration extensions only if ydoc is provided
      ...(ydoc
        ? [
            Collaboration.configure({
              document: ydoc,
            }),
            CollaborationCursor.configure({
              provider: provider || undefined,
              user: provider?.awareness.getLocalState()?.user || {
                name: 'Anonymous',
                color: '#808080',
              },
            }),
          ]
        : []),
    ],
    content: ydoc ? undefined : initialContent,
    editable,
    onUpdate: ({ editor }) => {
      if (onUpdate && !ydoc) {
        onUpdate(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  }, [ydoc, provider]);

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  return (
    <div className="editor-container">
      {editor && <EditorToolbar editor={editor} />}
      <div className="editor-content-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
