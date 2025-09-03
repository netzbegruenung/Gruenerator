import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Editor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

const randomColor = () => {
  const colors = ['#58a6ff', '#ff7b72', '#3fb950', '#d2a8ff', '#ffea7f'];
  return colors[Math.floor(Math.random() * colors.length)];
};

const TiptapTestPage = () => {
  const { documentId: routeDocumentId } = useParams();
  const documentId = routeDocumentId || 'demo';

  const [status, setStatus] = useState('disconnected');
  const [user] = useState(() => ({
    id: Math.random().toString(36).slice(2, 8),
    name: `User-${Math.random().toString(36).slice(2, 5)}`,
    color: randomColor(),
  }));

  const ydoc = useMemo(() => new Y.Doc(), []);

  const provider = useMemo(() => {
    const url = import.meta.env.VITE_HOCUSPOCUS_URL || 'ws://localhost:1240';
    const p = new HocuspocusProvider({
      url,
      name: documentId,
      document: ydoc,
    });
    p.on('status', (event) => setStatus(event.status));
    return p;
  }, [documentId, ydoc]);

  const editor = useMemo(() => {
    return new Editor({
      extensions: [
        StarterKit,
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({ provider, user }),
      ],
      autofocus: true,
      content: '',
    });
  }, [provider, user, ydoc]);

  useEffect(() => {
    return () => {
      editor?.destroy();
      provider?.destroy();
    };
  }, [editor, provider]);

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>TipTap + Hocuspocus Demo</span>
        <span style={{ padding: '2px 8px', borderRadius: 8, background: '#eee', fontSize: 12 }}>
          Doc: {documentId}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 8, background: status === 'connected' ? '#dcffe4' : '#ffe', color: '#333', fontSize: 12 }}>
          {status}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: user.color }} />
          <span style={{ fontSize: 12 }}>{user.name}</span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={() => editor.chain().focus().toggleBold().run()}>Bold</button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo; Quote</button>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minHeight: 240 }}>
        <EditorContent editor={editor} />
      </div>
      <p style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
        Open this page in another tab with the same documentId to see live collaboration.
      </p>
    </div>
  );
};

export default TiptapTestPage;

