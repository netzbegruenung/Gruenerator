'use dom';

import {
  DocsProvider,
  BlockNoteEditor as Editor,
  useCollaboration,
  type DocsAdapter,
} from '@gruenerator/docs';
import '@gruenerator/docs/styles';

interface BlockNoteEditorProps {
  documentId: string;
  authToken: string;
  userId: string;
  userName: string;
  userEmail: string;
  documentTitle: string;
  hocuspocusUrl: string;
  apiBaseUrl: string;
  onNavigateBack: () => void;
  onTitleChange: (title: string) => void;
  dom?: import('expo/dom').DOMProps;
}

function createDomAdapter(
  authToken: string,
  apiBaseUrl: string,
  hocuspocusUrl: string
): DocsAdapter {
  return {
    fetch: async (url, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Authorization', `Bearer ${authToken}`);
      return fetch(url, { ...options, headers });
    },
    getApiBaseUrl: () => apiBaseUrl,
    getHocuspocusUrl: () => hocuspocusUrl,
    getHocuspocusToken: async () => authToken,
    getAuthHeaders: async () => ({ Authorization: `Bearer ${authToken}` }),
    onUnauthorized: () => {},
    navigateToDocument: () => {},
    navigateToHome: () => {},
  };
}

function EditorWithCollaboration({
  documentId,
  documentTitle,
  userId,
  userName,
  userEmail,
  onNavigateBack,
  onTitleChange,
}: {
  documentId: string;
  documentTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
  onNavigateBack: () => void;
  onTitleChange: (title: string) => void;
}) {
  const { ydoc, provider, isSynced } = useCollaboration({
    documentId,
    user: { id: userId, display_name: userName, email: userEmail },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          gap: '12px',
        }}
      >
        <button
          onClick={onNavigateBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            border: 'none',
            background: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
          aria-label="Zurück"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="24"
            height="24"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <input
          type="text"
          defaultValue={documentTitle}
          onBlur={(e) => {
            if (e.target.value !== documentTitle) {
              onTitleChange(e.target.value);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 18,
            fontWeight: 600,
            border: 'none',
            outline: 'none',
            padding: '8px 0',
            background: 'none',
          }}
          placeholder="Dokumenttitel"
        />
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Editor documentId={documentId} ydoc={ydoc} provider={provider} isSynced={isSynced} />
      </div>
    </div>
  );
}

export default function BlockNoteEditor({
  documentId,
  authToken,
  userId,
  userName,
  userEmail,
  documentTitle,
  hocuspocusUrl,
  apiBaseUrl,
  onNavigateBack,
  onTitleChange,
}: BlockNoteEditorProps) {
  const adapter = createDomAdapter(authToken, apiBaseUrl, hocuspocusUrl);

  return (
    <DocsProvider adapter={adapter}>
      <EditorWithCollaboration
        documentId={documentId}
        documentTitle={documentTitle}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        onNavigateBack={onNavigateBack}
        onTitleChange={onTitleChange}
      />
    </DocsProvider>
  );
}
