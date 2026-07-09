'use dom';

import '@gruenerator/docs/styles';
import {
  useCollaboration,
  useCollaborators,
  useSyncGate,
  type CollaborationConfig,
} from '@gruenerator/collab';
import {
  DocsProvider,
  BlockNoteEditor,
  useDocumentChat,
  useDocsAdapter,
  useDocSuggestions,
  invokeDocumentAI,
  acceptDocumentAI,
  rejectDocumentAI,
  getDocUndoFlags,
  isSuggestionModeEnabled,
  setSuggestionMode,
  observeSuggestionMode,
  acceptSuggestionById,
  rejectSuggestionById,
  acceptAllSuggestions,
  rejectAllSuggestions,
  jumpToSuggestion,
  type DocsAdapter,
  type UndoableEditor,
} from '@gruenerator/docs/mobile';
import { type DOMProps } from 'expo/dom';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { BlockNoteEditor as BlockNoteEditorCore } from '@blocknote/core';
import type { EditorView } from 'prosemirror-view';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditorCore<any, any, any>;

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
        void this.receiveLoop();
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
    void this.bridge.wsSend(b64);
  }

  close(_code?: number, _reason?: string) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = BridgedWebSocket.CLOSING;
    void this.bridge.wsClose().then(() => {
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
        const parsed = JSON.parse(serialized) as {
          status: number;
          statusText: string;
          headers: Record<string, string>;
          body: BodyInit;
        };
        return new Response(parsed.body, {
          status: parsed.status,
          statusText: parsed.statusText,
          headers: parsed.headers,
        });
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
    getDocumentUrl: () => '',
    navigateToDocument: () => {},
    navigateToHome: () => {},
    getWebSocketPolyfill: wsBridge
      ? () => {
          (BridgedWebSocket as unknown as { __bridge: WsBridgeProps }).__bridge = wsBridge;
          return BridgedWebSocket as unknown as new (...args: unknown[]) => WebSocket;
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
  onAuthError?: (reason: string) => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onCanEditChange: (canEdit: boolean) => Promise<void>;
  onDocumentLoaded: (doc: { title: string; canEdit: boolean }) => Promise<void>;
  onChatMessagesChange: (messagesJson: string) => Promise<void>;
  onLocalUserIdChange: (userId: string) => Promise<void>;
  onTypingUsersChange: (usersJson: string) => Promise<void>;
  onCollaboratorsChange?: (collaboratorsJson: string) => Promise<void>;
  onActiveStylesChange?: (stylesJson: string) => Promise<void>;
  onDocSnapshotChange?: (markdown: string, selectionText: string) => void;
  onSlashChange?: (json: string) => void;
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void;
  onAiReviewPendingChange?: (pending: boolean) => void;
  onAiAcceptFailed?: () => void;
  // Track-changes (Änderungsmodus): mode flag + open-suggestion list, bridged to
  // native so the 3-dot menu reflects the mode and the review sheet lists changes.
  onSuggestionModeChange?: (enabled: boolean) => void;
  onSuggestionsChange?: (json: string) => void;
  proxyFetch?: (url: string, options?: string) => Promise<string>;
  wsOpen?: (url: string, protocols?: string) => Promise<string>;
  wsSend?: (b64: string) => Promise<void>;
  wsReceive?: () => Promise<string>;
  wsClose?: () => Promise<void>;
  pendingAction: { type: string; [key: string]: unknown } | null;
  actionCounter: number;
  dom?: DOMProps;
}

/**
 * Subscribe `fn` to editor content changes (and, if `selection`, selection
 * moves) with a trailing debounce, priming once immediately. Returns a cleanup
 * that clears the timer and unsubscribes. Shared by the doc-snapshot and
 * undo/redo effects so the debounce/subscribe boilerplate lives in one place.
 */
function subscribeDebouncedEditorChange(
  editor: {
    onChange?: (cb: () => void) => (() => void) | void;
    onSelectionChange?: (cb: () => void) => () => void;
  },
  fn: () => void,
  delayMs: number,
  options?: { selection?: boolean }
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const emit = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
  const unsubChange = editor.onChange?.(emit);
  const unsubSelection = options?.selection ? editor.onSelectionChange?.(emit) : undefined;
  emit();
  return () => {
    if (timer) clearTimeout(timer);
    if (typeof unsubChange === 'function') unsubChange();
    if (unsubSelection) unsubSelection();
  };
}

function EditorContent({
  documentId,
  userId,
  userName,
  userEmail,
  colorScheme,
  onConnectionStatusChange,
  onAuthError,
  onChatMessagesChange,
  onLocalUserIdChange,
  onTypingUsersChange,
  onCollaboratorsChange,
  onActiveStylesChange,
  onDocSnapshotChange,
  onSlashChange,
  onUndoRedoStateChange,
  onSuggestionModeChange,
  onSuggestionsChange,
}: {
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  colorScheme: 'light' | 'dark';
  onConnectionStatusChange: (status: string) => Promise<void>;
  onAuthError: (reason: string) => Promise<void>;
  onChatMessagesChange: (messagesJson: string) => Promise<void>;
  onLocalUserIdChange: (userId: string) => Promise<void>;
  onTypingUsersChange: (usersJson: string) => Promise<void>;
  onCollaboratorsChange?: (collaboratorsJson: string) => Promise<void>;
  onActiveStylesChange?: (stylesJson: string) => Promise<void>;
  onDocSnapshotChange?: (markdown: string, selectionText: string) => void;
  onSlashChange?: (json: string) => void;
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void;
  onSuggestionModeChange?: (enabled: boolean) => void;
  onSuggestionsChange?: (json: string) => void;
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
  const { ydoc, provider, isConnected, isSynced, authError } = useCollaboration({
    documentId,
    user,
    config: collabConfig,
  });
  const { messages, sendMessage, getLocalUser, setTyping, typingUsers } = useDocumentChat({
    ydoc,
    provider,
    isSynced,
  });
  // Remote collaborators from Yjs awareness — bridged to native for presence avatars.
  const collaborators = useCollaborators(provider);
  // Gate the editor mount until the initial Yjs sync completes (or times out) —
  // binding y-prosemirror to a not-yet-synced doc crashes with "nodeSize undefined".
  const editorReady = useSyncGate(provider, isSynced);

  // Editor instance ref for formatting operations
  const editorRef = useRef<unknown>(null);
  // Editor as state too, so the track-changes suggestions hook re-subscribes once
  // the editor is ready (a ref alone wouldn't trigger the hook's effect).
  const [editorInstance, setEditorInstance] = useState<AnyEditor | null>(null);

  const handleEditorReady = useCallback((editor: unknown) => {
    editorRef.current = editor;
    setEditorInstance(editor as AnyEditor);
  }, []);

  // Track-changes attribution: like the docs assistant chat, prefer the reliable
  // auth identity over Yjs awareness (which can be empty at edit time).
  const localUser = useMemo(() => ({ id: userId, name: userName }), [userId, userName]);

  // Doc-wide Änderungsmodus flag, synced via the Y.Doc `meta` map.
  const suggestionModeEnabled = useSyncExternalStore(
    useCallback((cb: () => void) => (ydoc ? observeSuggestionMode(ydoc, cb) : () => {}), [ydoc]),
    () => (ydoc ? isSuggestionModeEnabled(ydoc) : false),
    () => false
  );

  // Only scan the doc for suggestions while the mode is on (the O(doc) scan is
  // wasted otherwise); passing null clears the list.
  const { suggestions } = useDocSuggestions(suggestionModeEnabled ? editorInstance : null, ydoc);

  // Stable refs for callbacks — prevents re-firing effects when callback identity changes
  const onChatMessagesChangeRef = useRef(onChatMessagesChange);
  onChatMessagesChangeRef.current = onChatMessagesChange;
  const onLocalUserIdChangeRef = useRef(onLocalUserIdChange);
  onLocalUserIdChangeRef.current = onLocalUserIdChange;
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange);
  onConnectionStatusChangeRef.current = onConnectionStatusChange;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  const onTypingUsersChangeRef = useRef(onTypingUsersChange);
  onTypingUsersChangeRef.current = onTypingUsersChange;
  const onCollaboratorsChangeRef = useRef(onCollaboratorsChange);
  onCollaboratorsChangeRef.current = onCollaboratorsChange;
  const onActiveStylesChangeRef = useRef(onActiveStylesChange);
  onActiveStylesChangeRef.current = onActiveStylesChange;
  const onDocSnapshotChangeRef = useRef(onDocSnapshotChange);
  onDocSnapshotChangeRef.current = onDocSnapshotChange;
  const onSlashChangeRef = useRef(onSlashChange);
  onSlashChangeRef.current = onSlashChange;
  const onUndoRedoStateChangeRef = useRef(onUndoRedoStateChange);
  onUndoRedoStateChangeRef.current = onUndoRedoStateChange;
  const onSuggestionModeChangeRef = useRef(onSuggestionModeChange);
  onSuggestionModeChangeRef.current = onSuggestionModeChange;
  const onSuggestionsChangeRef = useRef(onSuggestionsChange);
  onSuggestionsChangeRef.current = onSuggestionsChange;

  // Bridge the track-changes mode flag to native (drives the 3-dot menu state).
  useEffect(() => {
    onSuggestionModeChangeRef.current?.(suggestionModeEnabled);
  }, [suggestionModeEnabled]);

  // Bridge the open-suggestion list to native (drives the review sheet).
  useEffect(() => {
    onSuggestionsChangeRef.current?.(JSON.stringify(suggestions));
  }, [suggestions]);

  // Handle track-changes actions dispatched from native (mode toggle + accept/
  // reject) against the live editor view + Y.Doc.
  useEffect(() => {
    const withView = (fn: (view: EditorView) => void) => {
      const view = (editorRef.current as { prosemirrorView?: EditorView } | null)?.prosemirrorView;
      if (view) fn(view);
    };

    const handleMode = (e: Event) => {
      if (!ydoc) return;
      const enabled = (e as CustomEvent<{ enabled: boolean }>).detail?.enabled;
      if (typeof enabled === 'boolean') setSuggestionMode(ydoc, enabled);
    };
    const handleAccept = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (ydoc && typeof id === 'number') withView((v) => acceptSuggestionById(v, ydoc, id));
    };
    const handleReject = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (ydoc && typeof id === 'number') withView((v) => rejectSuggestionById(v, ydoc, id));
    };
    const handleAcceptAll = () => {
      if (ydoc) withView((v) => acceptAllSuggestions(v, ydoc));
    };
    const handleRejectAll = () => {
      if (ydoc) withView((v) => rejectAllSuggestions(v, ydoc));
    };
    const handleSelect = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id === 'number') withView((v) => jumpToSuggestion(v, id));
    };

    window.addEventListener('suggestion-mode', handleMode);
    window.addEventListener('suggestion-accept', handleAccept);
    window.addEventListener('suggestion-reject', handleReject);
    window.addEventListener('suggestion-accept-all', handleAcceptAll);
    window.addEventListener('suggestion-reject-all', handleRejectAll);
    window.addEventListener('suggestion-select', handleSelect);
    return () => {
      window.removeEventListener('suggestion-mode', handleMode);
      window.removeEventListener('suggestion-accept', handleAccept);
      window.removeEventListener('suggestion-reject', handleReject);
      window.removeEventListener('suggestion-accept-all', handleAcceptAll);
      window.removeEventListener('suggestion-reject-all', handleRejectAll);
      window.removeEventListener('suggestion-select', handleSelect);
    };
  }, [ydoc]);

  // Subscribe to editor selection changes → send active styles to native
  useEffect(() => {
    const editor = editorRef.current as Record<string, unknown> | null;
    if (!editor || !onActiveStylesChangeRef.current) return;

    const onSelectionChange = (
      editor as { onSelectionChange: (cb: (e: unknown) => void) => () => void }
    ).onSelectionChange(() => {
      const ed = editorRef.current as {
        getActiveStyles: () => Record<string, boolean | string>;
        getTextCursorPosition: () => {
          block: {
            type: string;
            props: Record<string, unknown>;
            content?: Array<{ type?: string; text?: string }>;
          };
        };
        getSelectedText: () => string;
      } | null;
      if (!ed) return;
      try {
        const styles = ed.getActiveStyles();
        const cursor = ed.getTextCursorPosition();
        const selectedText = ed.getSelectedText();
        void onActiveStylesChangeRef.current!(
          JSON.stringify({
            hasSelection: selectedText.length > 0,
            ...styles,
            blockType: cursor?.block?.type || 'paragraph',
            blockProps: cursor?.block?.props || {},
          })
        );
        // Native slash menu: open while the current block's text is "/" + a
        // space-free query (mirrors BlockNote's "/" trigger). The RN menu renders
        // the items; selection converts the block via the slash-select action.
        if (onSlashChangeRef.current) {
          const content = cursor?.block?.content;
          const blockText = Array.isArray(content)
            ? content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('')
            : '';
          const match = selectedText.length === 0 ? /^\/(\S*)$/.exec(blockText) : null;
          onSlashChangeRef.current(JSON.stringify({ open: !!match, query: match ? match[1] : '' }));
        }
      } catch {
        // editor not ready
      }
    });

    return onSelectionChange;
  }, [isSynced]);

  // Snapshot the document markdown + current selection to native (for the AI
  // assistant context). Debounced ~600ms; fires on both content edits
  // (editor.onChange) and selection moves (editor.onSelectionChange).
  useEffect(() => {
    const editor = editorRef.current as {
      onChange?: (cb: () => void) => (() => void) | void;
      onSelectionChange?: (cb: () => void) => () => void;
    } | null;
    if (!editor || !onDocSnapshotChangeRef.current) return;

    return subscribeDebouncedEditorChange(
      editor,
      () => {
        const ed = editorRef.current as {
          document: unknown;
          blocksToMarkdownLossy: (blocks: unknown) => string | Promise<string>;
          getSelectedText?: () => string;
        } | null;
        if (!ed) return;
        // blocksToMarkdownLossy is sync (string) in this BlockNote version but
        // async in others — Promise.resolve normalizes both so `.then` is safe.
        void Promise.resolve(ed.blocksToMarkdownLossy(ed.document))
          .then((md) => {
            const sel = ed.getSelectedText?.() ?? '';
            onDocSnapshotChangeRef.current?.(md, sel);
          })
          .catch(() => {
            // editor not ready
          });
      },
      600,
      { selection: true }
    );
  }, [isSynced]);

  // Push undo/redo availability (BlockNote's per-user collab stack) to native so
  // the toolbar buttons enable/disable. Debounced lightly to limit bridge chatter
  // during fast typing; the native store dedupes redundant updates anyway.
  useEffect(() => {
    const editor = editorRef.current as {
      onChange?: (cb: () => void) => (() => void) | void;
    } | null;
    if (!editor || !onUndoRedoStateChangeRef.current) return;

    return subscribeDebouncedEditorChange(
      editor,
      () => {
        const { canUndo, canRedo } = getDocUndoFlags(editorRef.current as UndoableEditor | null);
        onUndoRedoStateChangeRef.current?.(canUndo, canRedo);
      },
      200
    );
  }, [isSynced]);

  // Listen for formatting actions from native
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
    const handleFormatAction = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          action: string;
          style?: string;
          blockType?: string;
          props?: Record<string, unknown>;
          alignment?: string;
        }>
      ).detail;
      const ed = editorRef.current as {
        toggleStyles: (s: Record<string, boolean>) => void;
        updateBlock: (block: unknown, update: Record<string, unknown>) => void;
        getTextCursorPosition: () => { block: unknown };
      } | null;
      if (!ed) return;
      try {
        if (detail.action === 'toggleStyle') {
          ed.toggleStyles({ [detail.style ?? '']: true });
        } else if (detail.action === 'setBlockType') {
          const block = ed.getTextCursorPosition()?.block;
          if (block) ed.updateBlock(block, { type: detail.blockType, props: detail.props });
        } else if (detail.action === 'setAlignment') {
          const block = ed.getTextCursorPosition()?.block;
          if (block) ed.updateBlock(block, { props: { textAlignment: detail.alignment } });
        }
      } catch {
        // editor not ready
      }
    };

    const handleInsertText = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (typeof text !== 'string' || !text) return;
      const ed = editorRef.current as {
        insertInlineContent: (content: string) => void;
      } | null;
      try {
        // Trailing space keeps successive dictated sentences from running together.
        ed?.insertInlineContent(`${text} `);
      } catch {
        // editor not ready
      }
    };

    const handleSlashSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ blockType: string; props?: Record<string, unknown> }>)
        .detail;
      const ed = editorRef.current as {
        updateBlock: (block: unknown, update: Record<string, unknown>) => void;
        getTextCursorPosition: () => { block: unknown };
      } | null;
      if (!ed) return;
      try {
        const block = ed.getTextCursorPosition()?.block;
        // content: [] clears the typed "/" + query; then convert to the picked type.
        if (block)
          ed.updateBlock(block, { type: detail.blockType, props: detail.props, content: [] });
      } catch {
        // editor not ready
      }
    };

    const handleUndoRedo = (e: Event) => {
      const direction = (e as CustomEvent<{ direction: 'undo' | 'redo' }>).detail?.direction;
      const ed = editorRef.current as { undo: () => void; redo: () => void } | null;
      if (!ed) return;
      try {
        if (direction === 'undo') ed.undo();
        else if (direction === 'redo') ed.redo();
      } catch {
        // editor not ready
      }
    };

    window.addEventListener('send-chat', handleSendChat);
    window.addEventListener('set-typing', handleSetTyping);
    window.addEventListener('format-action', handleFormatAction);
    window.addEventListener('insert-text', handleInsertText);
    window.addEventListener('slash-select', handleSlashSelect);
    window.addEventListener('undo-redo-action', handleUndoRedo);
    return () => {
      window.removeEventListener('send-chat', handleSendChat);
      window.removeEventListener('set-typing', handleSetTyping);
      window.removeEventListener('format-action', handleFormatAction);
      window.removeEventListener('insert-text', handleInsertText);
      window.removeEventListener('slash-select', handleSlashSelect);
      window.removeEventListener('undo-redo-action', handleUndoRedo);
    };
  }, [sendMessage, setTyping]);

  // Bridge chat messages to native — only re-fire when messages change, not callback identity
  useEffect(() => {
    void onChatMessagesChangeRef.current(JSON.stringify(messages));
  }, [messages]);

  // Bridge typing users to native
  useEffect(() => {
    void onTypingUsersChangeRef.current(JSON.stringify(typingUsers));
  }, [typingUsers]);

  // Bridge remote collaborators (awareness) to native for presence avatars
  useEffect(() => {
    void onCollaboratorsChangeRef.current?.(JSON.stringify(collaborators));
  }, [collaborators]);

  // Bridge local user ID to native
  useEffect(() => {
    const localUser = getLocalUser();
    if (localUser?.id) {
      void onLocalUserIdChangeRef.current(localUser.id);
    }
  }, [getLocalUser, isSynced]);

  // Report connection status back to native. Distinguish the initial-load window
  // ('connecting' — neutral, no red dot) from a genuine drop after having connected
  // ('disconnected' — red). Without this latch, both are just !isConnected and the
  // load flashes a red dot for 2-5s.
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected) hasConnectedRef.current = true;
    const status = isConnected
      ? isSynced
        ? 'connected'
        : 'syncing'
      : hasConnectedRef.current
        ? 'disconnected'
        : 'connecting';
    void onConnectionStatusChangeRef.current(status);
  }, [isConnected, isSynced]);

  // Surface the server's auth/access failure reason to native (otherwise a
  // failed handshake is just a silent red dot + a non-editable editor).
  useEffect(() => {
    if (authError) void onAuthErrorRef.current(authError);
  }, [authError]);

  // Set theme attribute for CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme);
  }, [colorScheme]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingInline: 8,
        }}
      >
        {editorReady ? (
          <BlockNoteEditor
            documentId={documentId}
            ydoc={ydoc}
            provider={provider}
            isSynced={isSynced}
            editable={isSynced}
            showComments={false}
            useStaticFormattingToolbar={false}
            hideFormattingToolbar={true}
            showDictationButton={false}
            localUser={localUser}
            onEditorReady={handleEditorReady}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              color: '#6b7280',
              fontSize: 14,
            }}
          >
            Verbinde mit Server...
          </div>
        )}
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
  const onAiReviewPendingChangeRef = useRef(props.onAiReviewPendingChange);
  onAiReviewPendingChangeRef.current = props.onAiReviewPendingChange;
  const onAiAcceptFailedRef = useRef(props.onAiAcceptFailed);
  onAiAcceptFailedRef.current = props.onAiAcceptFailed;

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
    } else if (props.pendingAction.type === 'format') {
      const style = (props.pendingAction as { type: string; style: string }).style;
      window.dispatchEvent(
        new CustomEvent('format-action', { detail: { action: 'toggleStyle', style } })
      );
    } else if (props.pendingAction.type === 'setBlockType') {
      const { blockType, props: blockProps } = props.pendingAction as {
        type: string;
        blockType: string;
        props?: Record<string, unknown>;
      };
      window.dispatchEvent(
        new CustomEvent('format-action', {
          detail: { action: 'setBlockType', blockType, props: blockProps },
        })
      );
    } else if (props.pendingAction.type === 'setAlignment') {
      const alignment = (props.pendingAction as { type: string; alignment: string }).alignment;
      window.dispatchEvent(
        new CustomEvent('format-action', { detail: { action: 'setAlignment', alignment } })
      );
    } else if (props.pendingAction.type === 'insert-text') {
      const text = (props.pendingAction as { type: string; text: string }).text;
      window.dispatchEvent(new CustomEvent('insert-text', { detail: { text } }));
    } else if (props.pendingAction.type === 'invoke-ai') {
      const { prompt, useSelection } = props.pendingAction as {
        type: string;
        prompt: string;
        useSelection: boolean;
      };
      // On success the diff is applied as ProseMirror suggestions; signal the
      // native review bar to appear (the web AI popover is suppressed on mobile).
      void invokeDocumentAI({
        documentId: props.documentId,
        userPrompt: prompt,
        useSelection,
      })
        .then((ok) => {
          if (ok) onAiReviewPendingChangeRef.current?.(true);
        })
        .catch((err) => {
          console.error('[DocEditorDOM] AI invoke failed:', err);
          onAiReviewPendingChangeRef.current?.(false);
        });
    } else if (props.pendingAction.type === 'accept-ai') {
      // NOTE: since the AI menu is never opened, the doc stays editable during
      // review (xl-ai normally locks isEditable via openAIMenuAtBlock). Accepted
      // as-is for now — no native editable-locking.
      const result = acceptDocumentAI(props.documentId);
      if (result === 'not-broadcast') onAiAcceptFailedRef.current?.();
      onAiReviewPendingChangeRef.current?.(false);
    } else if (props.pendingAction.type === 'reject-ai') {
      rejectDocumentAI(props.documentId);
      onAiReviewPendingChangeRef.current?.(false);
    } else if (props.pendingAction.type === 'undo') {
      window.dispatchEvent(new CustomEvent('undo-redo-action', { detail: { direction: 'undo' } }));
    } else if (props.pendingAction.type === 'redo') {
      window.dispatchEvent(new CustomEvent('undo-redo-action', { detail: { direction: 'redo' } }));
    } else if (props.pendingAction.type === 'slash-select') {
      const { blockType, props: blockProps } = props.pendingAction as {
        type: string;
        blockType: string;
        props?: Record<string, unknown>;
      };
      window.dispatchEvent(
        new CustomEvent('slash-select', { detail: { blockType, props: blockProps } })
      );
    } else if (props.pendingAction.type === 'set-suggestion-mode') {
      const enabled = (props.pendingAction as { type: string; enabled: boolean }).enabled;
      window.dispatchEvent(new CustomEvent('suggestion-mode', { detail: { enabled } }));
    } else if (props.pendingAction.type === 'accept-suggestion') {
      const id = (props.pendingAction as { type: string; id: number }).id;
      window.dispatchEvent(new CustomEvent('suggestion-accept', { detail: { id } }));
    } else if (props.pendingAction.type === 'reject-suggestion') {
      const id = (props.pendingAction as { type: string; id: number }).id;
      window.dispatchEvent(new CustomEvent('suggestion-reject', { detail: { id } }));
    } else if (props.pendingAction.type === 'accept-all-suggestions') {
      window.dispatchEvent(new CustomEvent('suggestion-accept-all'));
    } else if (props.pendingAction.type === 'reject-all-suggestions') {
      window.dispatchEvent(new CustomEvent('suggestion-reject-all'));
    } else if (props.pendingAction.type === 'select-suggestion') {
      const id = (props.pendingAction as { type: string; id: number }).id;
      window.dispatchEvent(new CustomEvent('suggestion-select', { detail: { id } }));
    }
  }, [props.pendingAction, props.actionCounter]);

  const handleConnectionStatusChange = useCallback(
    (status: string) => props.onConnectionStatusChange(status),
    [props.onConnectionStatusChange]
  );

  const handleAuthError = useCallback(
    (reason: string) => props.onAuthError?.(reason) ?? Promise.resolve(),
    [props.onAuthError]
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

  const handleCollaboratorsChange = useCallback(
    async (collaboratorsJson: string) => {
      if (props.onCollaboratorsChange) {
        await props.onCollaboratorsChange(collaboratorsJson);
      }
    },
    [props.onCollaboratorsChange]
  );

  const handleActiveStylesChange = useCallback(
    async (stylesJson: string) => {
      if (props.onActiveStylesChange) {
        await props.onActiveStylesChange(stylesJson);
      }
    },
    [props.onActiveStylesChange]
  );

  const handleDocSnapshotChange = useCallback(
    (markdown: string, selectionText: string) => {
      props.onDocSnapshotChange?.(markdown, selectionText);
    },
    [props.onDocSnapshotChange]
  );

  const handleUndoRedoStateChange = useCallback(
    (canUndo: boolean, canRedo: boolean) => {
      props.onUndoRedoStateChange?.(canUndo, canRedo);
    },
    [props.onUndoRedoStateChange]
  );

  const handleSuggestionModeChange = useCallback(
    (enabled: boolean) => {
      props.onSuggestionModeChange?.(enabled);
    },
    [props.onSuggestionModeChange]
  );

  const handleSuggestionsChange = useCallback(
    (json: string) => {
      props.onSuggestionsChange?.(json);
    },
    [props.onSuggestionsChange]
  );

  return (
    <DocsProvider adapter={adapter}>
      <EditorContent
        documentId={props.documentId}
        userId={props.userId}
        userName={props.userName}
        userEmail={props.userEmail}
        colorScheme={props.colorScheme}
        onConnectionStatusChange={handleConnectionStatusChange}
        onAuthError={handleAuthError}
        onChatMessagesChange={handleChatMessagesChange}
        onLocalUserIdChange={handleLocalUserIdChange}
        onTypingUsersChange={handleTypingUsersChange}
        onCollaboratorsChange={handleCollaboratorsChange}
        onActiveStylesChange={handleActiveStylesChange}
        onDocSnapshotChange={handleDocSnapshotChange}
        onSlashChange={props.onSlashChange}
        onUndoRedoStateChange={handleUndoRedoStateChange}
        onSuggestionModeChange={handleSuggestionModeChange}
        onSuggestionsChange={handleSuggestionsChange}
      />
    </DocsProvider>
  );
}
