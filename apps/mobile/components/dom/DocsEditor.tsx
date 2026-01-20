'use dom';

import { useState, useEffect, useRef } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Tiptap Core Extensions
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';

import './DocsEditor.css';

interface DocsEditorProps {
  documentId: string;
  authToken: string;
  userId: string;
  userName: string;
  userEmail: string;
  documentTitle: string;
  initialContent?: string;
  hocuspocusUrl: string;
  apiBaseUrl: string;
  onNavigateBack: () => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onContentChange?: (content: string) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

const generateUserColor = () => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function DocsEditor({
  documentId,
  authToken,
  userId,
  userName,
  userEmail,
  documentTitle,
  initialContent = '',
  hocuspocusUrl,
  apiBaseUrl,
  onNavigateBack,
  onTitleChange,
  onContentChange,
}: DocsEditorProps) {
  const [title, setTitle] = useState(documentTitle);
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const hasInitialized = useRef(false);

  // Initialize Y.js and Hocuspocus provider
  useEffect(() => {
    if (!documentId || !userId) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new HocuspocusProvider({
      url: hocuspocusUrl,
      name: documentId,
      document: ydoc,
      token: authToken,
    });

    providerRef.current = provider;

    // Set user awareness
    const awarenessUser: CollaborationUser = {
      id: userId,
      name: userName || userEmail || 'Anonymous',
      color: generateUserColor(),
    };
    provider.awareness?.setLocalStateField('user', awarenessUser);

    // Connection handlers
    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    provider.on('synced', () => {
      setIsSynced(true);
    });

    // Awareness change handler for collaborators
    const awareness = provider.awareness;
    const updateCollaborators = () => {
      if (!awareness) return;
      const states = awareness.getStates();
      const users: CollaborationUser[] = [];
      states.forEach((state, clientId) => {
        if (state.user && clientId !== awareness.clientID) {
          users.push(state.user as CollaborationUser);
        }
      });
      setCollaborators(users);
    };

    awareness?.on('change', updateCollaborators);
    updateCollaborators();

    return () => {
      awareness?.setLocalState(null);
      awareness?.off('change', updateCollaborators);
      provider.destroy();
    };
  }, [documentId, userId, hocuspocusUrl, authToken, userName, userEmail]);

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Dokumenteditor',
        class: 'docs-editor-content',
      },
    },
    extensions: [
      StarterKit.configure({
        history: ydocRef.current ? false : undefined,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Beginne zu schreiben...',
      }),
      ...(ydocRef.current
        ? [
            Collaboration.configure({
              document: ydocRef.current,
            }),
            CollaborationCursor.configure({
              provider: providerRef.current || undefined,
              user: {
                name: userName || userEmail || 'Anonymous',
                color: generateUserColor(),
              },
            }),
          ]
        : []),
    ],
    content: ydocRef.current ? undefined : initialContent,
    onUpdate: ({ editor }) => {
      if (onContentChange && !ydocRef.current) {
        onContentChange(editor.getHTML());
      }
    },
  }, [ydocRef.current, providerRef.current]);

  // Initialize Y.js document with HTML content
  useEffect(() => {
    if (
      editor &&
      ydocRef.current &&
      initialContent &&
      !hasInitialized.current &&
      isSynced
    ) {
      const fragment = ydocRef.current.getXmlFragment('default');
      const isEmpty = fragment.length === 0;

      if (isEmpty) {
        editor.commands.setContent(initialContent);
        hasInitialized.current = true;
      }
    }
  }, [editor, initialContent, isSynced]);

  const handleTitleBlur = async () => {
    if (title !== documentTitle) {
      await onTitleChange(title);
    }
  };

  const handleExport = async () => {
    if (!editor) return;

    try {
      const content = editor.getHTML();
      const response = await fetch(`${apiBaseUrl}/exports/docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content, title }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${title || 'Dokument'}.docx`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }

    setShowActionSheet(false);
  };

  const connectionStatus = !isConnected ? 'disconnected' : (!isSynced ? 'syncing' : 'connected');

  return (
    <div className="docs-editor-wrapper">
      <header className="docs-editor-header">
        <div className="header-left">
          <button
            onClick={onNavigateBack}
            className="back-button"
            aria-label="Zurück"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="title-input"
            placeholder="Dokumenttitel"
          />
          <div
            className={`connection-indicator ${connectionStatus}`}
            title={!isConnected ? 'Getrennt' : (!isSynced ? 'Synchronisiert...' : 'Verbunden')}
          />
        </div>

        <div className="header-right">
          {collaborators.length > 0 && (
            <div className="collaborators-display">
              <div className="collaborators-stack">
                {collaborators.slice(0, 3).map((collaborator, index) => (
                  <div
                    key={collaborator.id}
                    className="collaborator-avatar"
                    style={{
                      backgroundColor: collaborator.color,
                      zIndex: 3 - index,
                    }}
                    title={collaborator.name}
                  >
                    {collaborator.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {collaborators.length > 3 && (
                  <div className="collaborator-avatar overflow-avatar">
                    +{collaborators.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => setShowActionSheet(true)}
            className="menu-button"
            aria-label="Aktionen"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </header>

      <main className="docs-editor-main">
        <EditorContext.Provider value={{ editor }}>
          <EditorContent
            editor={editor}
            role="presentation"
            className="editor-content-wrapper"
          />
        </EditorContext.Provider>
      </main>

      {/* Simple Action Sheet */}
      {showActionSheet && (
        <>
          <div
            className="action-sheet-overlay"
            onClick={() => setShowActionSheet(false)}
          />
          <div className="action-sheet">
            <div className="action-sheet-handle" />
            <div className="action-sheet-content">
              <button className="action-sheet-item" onClick={handleExport}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                <span>Als Word exportieren</span>
              </button>
              <button className="action-sheet-cancel" onClick={() => setShowActionSheet(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
