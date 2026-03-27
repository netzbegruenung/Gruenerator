'use dom';

import '@mantine/core/styles.css';
import '@blocknote/core/style.css';
import '@blocknote/mantine/style.css';
import '@blocknote/mantine/src/blocknoteStyles.css';
import '@blocknote/xl-ai/style.css';
import '@gruenerator/docs/styles';
import { useCollaboration, type CollaborationConfig } from '@gruenerator/collab';
import {
  DocsProvider,
  BlockNoteEditor,
  useDocumentChat,
  useDocsAdapter,
  type DocsAdapter,
} from '@gruenerator/docs';
import { MantineProvider } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef } from 'react';

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
  onChatMessagesChange: (messagesJson: string) => Promise<void>;
  onLocalUserIdChange: (userId: string) => Promise<void>;
  onTypingUsersChange: (usersJson: string) => Promise<void>;
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
  onChatMessagesChange,
  onLocalUserIdChange,
  onTypingUsersChange,
}: {
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  colorScheme: 'light' | 'dark';
  onConnectionStatusChange: (status: string) => Promise<void>;
  onChatMessagesChange: (messagesJson: string) => Promise<void>;
  onLocalUserIdChange: (userId: string) => Promise<void>;
  onTypingUsersChange: (usersJson: string) => Promise<void>;
}) {
  const user = useMemo(
    () => ({ id: userId, display_name: userName, email: userEmail }),
    [userId, userName, userEmail]
  );
  const adapter = useDocsAdapter();
  const collabConfig: CollaborationConfig = useMemo(
    () => ({
      url: adapter.getHocuspocusUrl(),
      getToken: () => adapter.getHocuspocusToken(),
      getWebSocketPolyfill: adapter.getWebSocketPolyfill,
    }),
    [adapter]
  );
  const { ydoc, provider, isConnected, isSynced } = useCollaboration({
    documentId,
    user,
    config: collabConfig,
  });
  const { messages, sendMessage, getLocalUser, setTyping, typingUsers } = useDocumentChat({
    ydoc,
    provider,
    isSynced,
  });

  // Stable refs for callbacks — prevents re-firing effects when callback identity changes
  const onChatMessagesChangeRef = useRef(onChatMessagesChange);
  onChatMessagesChangeRef.current = onChatMessagesChange;
  const onLocalUserIdChangeRef = useRef(onLocalUserIdChange);
  onLocalUserIdChangeRef.current = onLocalUserIdChange;
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange);
  onConnectionStatusChangeRef.current = onConnectionStatusChange;
  const onTypingUsersChangeRef = useRef(onTypingUsersChange);
  onTypingUsersChangeRef.current = onTypingUsersChange;

  // Listen for send-chat actions dispatched from native via DocEditorDOM
  // Uses CustomEvent (not postMessage) to avoid collision with Expo's DOM bridge
  useEffect(() => {
    const handleSendChat = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (typeof text === 'string') {
        sendMessage(text, { id: userId, name: userName, color: '#52B788' });
        setTyping(false);
      }
    };
    const handleSetTyping = (e: Event) => {
      const isTyping = (e as CustomEvent<{ isTyping: boolean }>).detail?.isTyping;
      if (typeof isTyping === 'boolean') setTyping(isTyping);
    };
    window.addEventListener('send-chat', handleSendChat);
    window.addEventListener('set-typing', handleSetTyping);
    return () => {
      window.removeEventListener('send-chat', handleSendChat);
      window.removeEventListener('set-typing', handleSetTyping);
    };
  }, [sendMessage, setTyping]);

  // Bridge chat messages to native — only re-fire when messages change, not callback identity
  useEffect(() => {
    onChatMessagesChangeRef.current(JSON.stringify(messages));
  }, [messages]);

  // Bridge typing users to native
  useEffect(() => {
    onTypingUsersChangeRef.current(JSON.stringify(typingUsers));
  }, [typingUsers]);

  // Bridge local user ID to native
  useEffect(() => {
    const localUser = getLocalUser();
    if (localUser?.id) {
      onLocalUserIdChangeRef.current(localUser.id);
    }
  }, [getLocalUser, isSynced]);

  // Report connection status back to native
  useEffect(() => {
    const status = !isConnected ? 'disconnected' : !isSynced ? 'syncing' : 'connected';
    onConnectionStatusChangeRef.current(status);
  }, [isConnected, isSynced]);

  // Set theme attribute for CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme);
    document.documentElement.setAttribute('data-mantine-color-scheme', colorScheme);
  }, [colorScheme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ flex: 1, overflow: 'auto', paddingInline: 8 }}>
        <BlockNoteEditor
          documentId={documentId}
          ydoc={ydoc}
          provider={provider}
          isSynced={isSynced}
          editable={isSynced}
          showComments={false}
          useStaticFormattingToolbar={true}
        />
      </div>
    </div>
  );
}

export default function DocEditorDOM(props: DocEditorDOMProps) {
  // Stabilize function props with refs — Expo DOM bridge creates new wrappers on every
  // native re-render, but the underlying functions are logically stable. Without refs,
  // the adapter would be recreated on every render, destroying the Hocuspocus provider.
  const proxyFetchRef = useRef(props.proxyFetch);
  proxyFetchRef.current = props.proxyFetch;
  const wsOpenRef = useRef(props.wsOpen);
  wsOpenRef.current = props.wsOpen;
  const wsSendRef = useRef(props.wsSend);
  wsSendRef.current = props.wsSend;
  const wsReceiveRef = useRef(props.wsReceive);
  wsReceiveRef.current = props.wsReceive;
  const wsCloseRef = useRef(props.wsClose);
  wsCloseRef.current = props.wsClose;

  const hasWsBridge = !!(props.wsOpen && props.wsSend && props.wsReceive && props.wsClose);

  const adapter = useMemo(
    () => {
      const stableWsBridge: WsBridgeProps | undefined = hasWsBridge
        ? {
            wsOpen: (url, protocols) => wsOpenRef.current!(url, protocols),
            wsSend: (b64) => wsSendRef.current!(b64),
            wsReceive: () => wsReceiveRef.current!(),
            wsClose: () => wsCloseRef.current!(),
          }
        : undefined;

      return createDomAdapter(
        props.authToken,
        props.apiBaseUrl,
        props.hocuspocusUrl,
        (url, options) => proxyFetchRef.current!(url, options),
        stableWsBridge
      );
    },
    // Only recreate when actual values change, not function wrapper identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.authToken, props.apiBaseUrl, props.hocuspocusUrl, hasWsBridge]
  );

  // Handle pending actions from native (send-chat, share, export)
  const lastProcessedAction = useRef(0);
  useEffect(() => {
    if (!props.pendingAction || props.actionCounter <= lastProcessedAction.current) return;
    lastProcessedAction.current = props.actionCounter;

    if (props.pendingAction.type === 'send-chat') {
      const text = (props.pendingAction as { type: string; text: string }).text;
      window.dispatchEvent(new CustomEvent('send-chat', { detail: { text } }));
    } else if (props.pendingAction.type === 'set-typing') {
      const isTyping = (props.pendingAction as { type: string; isTyping: boolean }).isTyping;
      window.dispatchEvent(new CustomEvent('set-typing', { detail: { isTyping } }));
    }
  }, [props.pendingAction, props.actionCounter]);

  const handleConnectionStatusChange = useCallback(
    (status: string) => props.onConnectionStatusChange(status),
    [props.onConnectionStatusChange]
  );

  const handleChatMessagesChange = useCallback(
    (messagesJson: string) => props.onChatMessagesChange(messagesJson),
    [props.onChatMessagesChange]
  );

  const handleLocalUserIdChange = useCallback(
    (userId: string) => props.onLocalUserIdChange(userId),
    [props.onLocalUserIdChange]
  );

  const handleTypingUsersChange = useCallback(
    (usersJson: string) => props.onTypingUsersChange(usersJson),
    [props.onTypingUsersChange]
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
          onChatMessagesChange={handleChatMessagesChange}
          onLocalUserIdChange={handleLocalUserIdChange}
          onTypingUsersChange={handleTypingUsersChange}
        />
      </MantineProvider>
    </DocsProvider>
  );
}
