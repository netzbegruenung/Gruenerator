import { create } from 'zustand';

export interface ChatConfig {
  /** Custom fetch function. Default: fetch with credentials:'include' */
  fetch?: (url: string, options?: RequestInit) => Promise<Response>;
  /** Called on 401. Default: redirect to /login */
  onUnauthorized?: () => void;
  /** API endpoint overrides (all have defaults matching current paths) */
  endpoints?: {
    chatStream?: string;
    chatResume?: string;
    searchStream?: string;
    notebookStream?: string;
    messages?: string;
    threads?: string;
    summarize?: string;
    exportMessage?: string;
    exportToDocs?: string;
    chatConfirm?: string;
  };
  /** Base URL for the Docs app. Auto-detected from hostname if not set. */
  docsBaseUrl?: string;
  /** Optional override for the "Edit in Docs" action. If unset, MessageActions falls back to opening `${getDocsUrl()}/document/${id}` in a new tab. Returns documentId for reuse. */
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
  /** Opens a single sharepic variant in the canvas editor for editing. */
  onEditSharepic?: (variant: import('../hooks/useChatGraphStream').SharepicVariant) => void;
  /** Renders a sharepic to a base64 PNG using the canvas editor. */
  renderSharepic?: (
    canvasType: string,
    initialProps: Record<string, unknown>
  ) => Promise<string | null>;
}

export interface ResolvedEndpoints {
  chatStream: string;
  chatResume: string;
  searchStream: string;
  notebookStream: string;
  messages: string;
  threads: string;
  summarize: string;
  exportMessage: string;
  exportToDocs: string;
  chatConfirm: string;
}

interface ResolvedChatConfig {
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  onUnauthorized: () => void;
  endpoints: ResolvedEndpoints;
  docsBaseUrl?: string;
}

/**
 * Per-message context a chat surface (e.g. the docs editor) can inject into
 * outgoing requests without owning the model adapter. Keyed by threadId in
 * `contextProviders` so multiple surfaces coexist without clobbering each other.
 */
export interface ChatRequestContext {
  documentChatIds?: string[];
  attachmentContext?: string;
  selectionText?: string;
  /**
   * The document the user is currently editing — primary conversation context
   * when chat is embedded in a document editor. Distinct from `documentChatIds`
   * (explicit @dokumentchat retrieval scope): this IS the conversation subject.
   */
  currentDocument?: {
    id: string;
    title?: string | null;
    markdown: string;
    selectionText?: string | null;
  };
}

export type ChatRequestContextProvider = () => Promise<ChatRequestContext> | ChatRequestContext;

/**
 * Handler the docs-editor surface registers to receive `trigger_doc_edit` SSE
 * events from the chat backend. The handler dispatches the prompt into
 * BlockNote's AIExtension, which runs the existing /api/docs/ai pipeline and
 * applies operations to the editor with Yjs sync.
 */
export interface DocumentEditTriggerPayload {
  targetDocumentId: string;
  userPrompt: string;
  useSelection: boolean;
}

export type DocumentEditTriggerHandler = (
  payload: DocumentEditTriggerPayload
) => void | Promise<void>;

interface ChatConfigStore extends ResolvedChatConfig {
  configure: (config?: ChatConfig) => void;
  getDocsUrl: () => string;
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
  onEditSharepic?: (variant: import('../hooks/useChatGraphStream').SharepicVariant) => void;
  renderSharepic?: (
    canvasType: string,
    initialProps: Record<string, unknown>
  ) => Promise<string | null>;
  /** threadId → context-getter, populated by host surfaces (e.g. docs editor). */
  contextProviders: Map<string, ChatRequestContextProvider>;
  /** Register a context provider for a thread. Returns the unregister function. */
  registerContextProvider: (threadId: string, provider: ChatRequestContextProvider) => () => void;
  /** threadId → live-edit dispatcher (docs editor surface only). */
  documentEditHandlers: Map<string, DocumentEditTriggerHandler>;
  /** Register a live-edit handler for a thread. Returns the unregister function. */
  registerDocumentEditHandler: (
    threadId: string,
    handler: DocumentEditTriggerHandler
  ) => () => void;
}

const DEFAULT_ENDPOINTS: ResolvedEndpoints = {
  chatStream: '/api/chat-graph/stream',
  chatResume: '/api/chat-graph/resume',
  searchStream: '/api/search-graph/stream',
  notebookStream: '/api/chat-service/notebook/stream',
  messages: '/api/chat-service/messages',
  threads: '/api/chat-service/threads',
  summarize: '/api/chat-service/summarize',
  exportMessage: '/api/exports/chat-message',
  exportToDocs: '/api/docs/from-export',
  chatConfirm: '/api/chat-service/confirm',
};

function resolveDocsUrl(configured?: string): string {
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//localhost:3002`;
  }
  return `${window.location.protocol}//docs.${hostname}`;
}

function defaultFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, { ...options, credentials: 'include' });
}

const PUBLIC_PATHS = ['/datenschutz', '/impressum', '/support', '/login', '/auth'];
const PUBLIC_PREFIXES = ['/auth/', '/shared/', '/subtitler/shared/'];

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function defaultOnUnauthorized(): void {
  if (typeof window === 'undefined') return;
  const p = window.location.pathname;
  if (isPublicPath(p)) return;
  const currentPath = p + window.location.search;
  window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
}

export const useChatConfigStore = create<ChatConfigStore>((set, get) => ({
  fetch: defaultFetch,
  onUnauthorized: defaultOnUnauthorized,
  endpoints: DEFAULT_ENDPOINTS,
  docsBaseUrl: undefined,
  onEditInDocs: undefined,
  contextProviders: new Map(),
  documentEditHandlers: new Map(),

  configure: (config?: ChatConfig) => {
    set({
      fetch: config?.fetch ?? defaultFetch,
      onUnauthorized: config?.onUnauthorized ?? defaultOnUnauthorized,
      endpoints: { ...DEFAULT_ENDPOINTS, ...config?.endpoints },
      docsBaseUrl: config?.docsBaseUrl,
      onEditInDocs: config?.onEditInDocs,
      onEditSharepic: config?.onEditSharepic,
      renderSharepic: config?.renderSharepic,
    });
  },

  registerContextProvider: (threadId, provider) => {
    const next = new Map(get().contextProviders);
    next.set(threadId, provider);
    set({ contextProviders: next });
    return () => {
      const after = new Map(get().contextProviders);
      if (after.get(threadId) === provider) {
        after.delete(threadId);
        set({ contextProviders: after });
      }
    };
  },

  registerDocumentEditHandler: (threadId, handler) => {
    const next = new Map(get().documentEditHandlers);
    next.set(threadId, handler);
    set({ documentEditHandlers: next });
    return () => {
      const after = new Map(get().documentEditHandlers);
      if (after.get(threadId) === handler) {
        after.delete(threadId);
        set({ documentEditHandlers: after });
      }
    };
  },

  getDocsUrl: () => resolveDocsUrl(get().docsBaseUrl),
}));

export function useChatFetch() {
  return useChatConfigStore((s) => s.fetch);
}

export function useChatEndpoints() {
  return useChatConfigStore((s) => s.endpoints);
}
