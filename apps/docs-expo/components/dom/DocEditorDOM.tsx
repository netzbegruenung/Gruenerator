'use dom';

import '@mantine/core/styles.css';
import '@blocknote/core/style.css';
import '@blocknote/mantine/style.css';
import '@blocknote/xl-ai/style.css';
import '@gruenerator/docs/styles';
import {
  DocsProvider,
  BlockNoteEditor,
  ChatSidebar,
  useCollaboration,
  useDocumentChat,
  type DocsAdapter,
} from '@gruenerator/docs';
import { MantineProvider, SegmentedControl, ScrollArea } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// --- Base64 <-> ArrayBuffer helpers for the WebSocket bridge ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- BridgedWebSocket: proxies WS through native async props ---

type WsBridgeProps = {
  wsOpen: (url: string, protocols?: string) => Promise<string>;
  wsSend: (b64: string) => Promise<void>;
  wsReceive: () => Promise<string>;
  wsClose: () => Promise<void>;
};

class BridgedWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  binaryType: BinaryType = 'arraybuffer';
  readyState: number = BridgedWebSocket.CONNECTING;
  url: string;
  protocol = '';
  extensions = '';
  bufferedAmount = 0;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  private closed = false;
  private bridge: WsBridgeProps;
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.bridge = (BridgedWebSocket as unknown as { __bridge: WsBridgeProps }).__bridge;
    const protocolStr = Array.isArray(protocols) ? protocols.join(',') : protocols;

    this.bridge
      .wsOpen(this.url, protocolStr)
      .then(() => {
        this.readyState = BridgedWebSocket.OPEN;
        this.emit('open', new Event('open'));
        this.receiveLoop();
      })
      .catch(() => {
        this.readyState = BridgedWebSocket.CLOSED;
        this.emit('error', new Event('error'));
      });
  }

  private async receiveLoop() {
    while (!this.closed) {
      try {
        const b64 = await this.bridge.wsReceive();
        if (b64 === '__close__') {
          this.readyState = BridgedWebSocket.CLOSED;
          this.closed = true;
          this.emit('close', new CloseEvent('close', { code: 1000, wasClean: true }));
          break;
        }
        // Decode: 'str:' prefix = text message, otherwise binary
        let data: ArrayBuffer | string;
        if (b64.startsWith('str:')) {
          data = decodeURIComponent(escape(atob(b64.slice(4))));
          if (this.binaryType === 'arraybuffer') {
            // HocuspocusProvider expects ArrayBuffer — encode UTF-8
            const encoder = new TextEncoder();
            data = encoder.encode(data as string).buffer;
          }
        } else {
          data = base64ToArrayBuffer(b64);
        }
        this.emit('message', { data } as MessageEvent);
      } catch {
        if (!this.closed) {
          this.readyState = BridgedWebSocket.CLOSED;
          this.closed = true;
          this.emit('error', new Event('error'));
        }
        break;
      }
    }
  }

  send(data: string | ArrayBuffer | Uint8Array | ArrayBufferView) {
    if (this.readyState !== BridgedWebSocket.OPEN) return;
    let b64: string;
    if (typeof data === 'string') {
      b64 = 'str:' + btoa(unescape(encodeURIComponent(data)));
    } else if (data instanceof ArrayBuffer) {
      b64 = arrayBufferToBase64(data);
    } else if (ArrayBuffer.isView(data)) {
      b64 = arrayBufferToBase64(data.buffer as ArrayBuffer);
    } else {
      return;
    }
    this.bridge.wsSend(b64);
  }

  close(_code?: number, _reason?: string) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = BridgedWebSocket.CLOSING;
    this.bridge.wsClose().then(() => {
      this.readyState = BridgedWebSocket.CLOSED;
    });
  }

  private emit(type: string, ev: unknown) {
    const handler = (this as Record<string, unknown>)[`on${type}`];
    if (typeof handler === 'function') (handler as (e: unknown) => void)(ev);
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }

  addEventListener(type: string, fn: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void) {
    const arr = this.listeners[type];
    if (arr) this.listeners[type] = arr.filter((f) => f !== fn);
  }
  dispatchEvent() {
    return false;
  }
}

// --- Proxied adapter factory ---

function createDomAdapter(
  authToken: string,
  apiBaseUrl: string,
  hocuspocusUrl: string,
  proxyFetch?: DocEditorDOMProps['proxyFetch'],
  wsBridge?: WsBridgeProps
): DocsAdapter {
  return {
    fetch: async (url, options) => {
      if (proxyFetch) {
        const serialized = await proxyFetch(
          url,
          JSON.stringify({
            method: options?.method,
            headers: Object.fromEntries(new Headers(options?.headers).entries()),
            body: options?.body,
          })
        );
        const { status, statusText, headers, body } = JSON.parse(serialized);
        return new Response(body, { status, statusText, headers });
      }
      // Fallback: direct fetch (works on web, not in DOM WebView)
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
    getWebSocketPolyfill: wsBridge
      ? () => {
          (BridgedWebSocket as unknown as { __bridge: WsBridgeProps }).__bridge = wsBridge;
          return BridgedWebSocket;
        }
      : undefined,
  };
}

interface DocEditorDOMProps {
  documentId: string;
  authToken: string;
  userId: string;
  userName: string;
  userEmail: string;
  initialTitle: string;
  hocuspocusUrl: string;
  apiBaseUrl: string;
  colorScheme: 'light' | 'dark';
  onConnectionStatusChange: (status: string) => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onCanEditChange: (canEdit: boolean) => Promise<void>;
  onDocumentLoaded: (doc: { title: string; canEdit: boolean }) => Promise<void>;
  proxyFetch?: (url: string, options?: string) => Promise<string>;
  wsOpen?: (url: string, protocols?: string) => Promise<string>;
  wsSend?: (b64: string) => Promise<void>;
  wsReceive?: () => Promise<string>;
  wsClose?: () => Promise<void>;
  pendingAction: { type: string; [key: string]: unknown } | null;
  actionCounter: number;
  dom?: import('expo/dom').DOMProps;
}

function EditorContent({
  documentId,
  userId,
  userName,
  userEmail,
  colorScheme,
  onConnectionStatusChange,
}: {
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  colorScheme: 'light' | 'dark';
  onConnectionStatusChange: (status: string) => Promise<void>;
}) {
  const user = useMemo(
    () => ({ id: userId, display_name: userName, email: userEmail }),
    [userId, userName, userEmail]
  );
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId,
    user,
  });
  const { messages, sendMessage, getLocalUser } = useDocumentChat({ ydoc, provider, isSynced });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'comments'>('chat');
  const commentsPortalRef = useRef<HTMLDivElement>(null);
  const [commentsPortalTarget, setCommentsPortalTarget] = useState<HTMLElement | null>(null);

  // Sync portal target with overlay state (same pattern as EditorPage.tsx:282-286)
  useEffect(() => {
    setCommentsPortalTarget(
      sidebarOpen && sidebarTab === 'comments' ? commentsPortalRef.current : null
    );
  }, [sidebarOpen, sidebarTab]);

  // Report connection status back to native
  useEffect(() => {
    const status = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';
    onConnectionStatusChange(status);
  }, [isConnected, isSynced, onConnectionStatusChange]);

  // Listen for toggle-chat action from native top bar
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'toggle-chat') {
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Set theme attribute for CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme);
    document.documentElement.setAttribute('data-mantine-color-scheme', colorScheme);
  }, [colorScheme]);

  const localUser = getLocalUser();

  if (!isSynced) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: colorScheme === 'dark' ? '#e5e7eb' : '#374151',
          backgroundColor: colorScheme === 'dark' ? '#111827' : '#fff',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #316049',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
            {isConnected ? 'Synchronisiere...' : 'Verbinde...'}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}
    >
      {/* Editor */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <BlockNoteEditor
          documentId={documentId}
          ydoc={ydoc}
          provider={provider}
          isSynced={isSynced}
          editable={true}
          showComments={true}
          commentsPortalTarget={commentsPortalTarget}
          useStaticFormattingToolbar={true}
        />
      </div>

      {/* Full-screen overlay for Chat + Comments */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor:
              colorScheme === 'dark' ? 'var(--grey-900, #111827)' : 'var(--background-color, #fff)',
          }}
        >
          {/* Header with close button + tab toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 12px',
              gap: '8px',
              borderBottom: `1px solid ${colorScheme === 'dark' ? 'var(--grey-700, #374151)' : 'var(--grey-200, #e5e7eb)'}`,
            }}
          >
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Schließen"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                border: 'none',
                borderRadius: 8,
                background: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                color: colorScheme === 'dark' ? '#e5e7eb' : '#374151',
                fontSize: 18,
              }}
            >
              ✕
            </button>
            <SegmentedControl
              value={sidebarTab}
              onChange={(val) => setSidebarTab(val as 'chat' | 'comments')}
              data={[
                { label: 'Chat', value: 'chat' },
                { label: 'Kommentare', value: 'comments' },
              ]}
              size="xs"
              fullWidth
              style={{ flex: 1 }}
            />
          </div>

          {/* Chat tab */}
          {sidebarTab === 'chat' && (
            <ChatSidebar
              messages={messages}
              currentUserId={localUser?.id ?? null}
              onSend={sendMessage}
              isConnected={isConnected}
              hideHeader
            />
          )}

          {/* Comments tab — BlockNote renders ThreadsSidebar via portal */}
          {sidebarTab === 'comments' && (
            <ScrollArea style={{ flex: 1 }}>
              <div ref={commentsPortalRef} style={{ padding: '8px' }} />
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocEditorDOM(props: DocEditorDOMProps) {
  const wsBridge: WsBridgeProps | undefined =
    props.wsOpen && props.wsSend && props.wsReceive && props.wsClose
      ? {
          wsOpen: props.wsOpen,
          wsSend: props.wsSend,
          wsReceive: props.wsReceive,
          wsClose: props.wsClose,
        }
      : undefined;

  const adapter = useMemo(
    () =>
      createDomAdapter(
        props.authToken,
        props.apiBaseUrl,
        props.hocuspocusUrl,
        props.proxyFetch,
        wsBridge
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.authToken, props.apiBaseUrl, props.hocuspocusUrl, props.proxyFetch, props.wsOpen]
  );

  // Handle pending actions from native (toggle-chat, share, export)
  const lastProcessedAction = useRef(0);
  useEffect(() => {
    if (!props.pendingAction || props.actionCounter <= lastProcessedAction.current) return;
    lastProcessedAction.current = props.actionCounter;

    if (props.pendingAction.type === 'toggle-chat') {
      window.postMessage({ type: 'toggle-chat' }, '*');
    }
  }, [props.pendingAction, props.actionCounter]);

  const handleConnectionStatusChange = useCallback(
    (status: string) => props.onConnectionStatusChange(status),
    [props.onConnectionStatusChange]
  );

  return (
    <DocsProvider adapter={adapter}>
      <MantineProvider forceColorScheme={props.colorScheme}>
        <EditorContent
          documentId={props.documentId}
          userId={props.userId}
          userName={props.userName}
          userEmail={props.userEmail}
          colorScheme={props.colorScheme}
          onConnectionStatusChange={handleConnectionStatusChange}
        />
      </MantineProvider>
    </DocsProvider>
  );
}
