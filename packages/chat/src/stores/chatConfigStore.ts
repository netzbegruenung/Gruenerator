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
    deepStream?: string;
    searchStream?: string;
    notebookStream?: string;
    messages?: string;
    threads?: string;
    summarize?: string;
    exportMessage?: string;
    exportToDocs?: string;
  };
  /** Base URL for the Docs app. Auto-detected from hostname if not set. */
  docsBaseUrl?: string;
  /** Opens content in an inline docs editor instead of a new tab. Returns documentId for reuse. */
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
}

export interface ResolvedEndpoints {
  chatStream: string;
  chatResume: string;
  deepStream: string;
  searchStream: string;
  notebookStream: string;
  messages: string;
  threads: string;
  summarize: string;
  exportMessage: string;
  exportToDocs: string;
}

interface ResolvedChatConfig {
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  onUnauthorized: () => void;
  endpoints: ResolvedEndpoints;
  docsBaseUrl?: string;
}

interface ChatConfigStore extends ResolvedChatConfig {
  configure: (config?: ChatConfig) => void;
  getDocsUrl: () => string;
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
}

const DEFAULT_ENDPOINTS: ResolvedEndpoints = {
  chatStream: '/api/chat-graph/stream',
  chatResume: '/api/chat-graph/resume',
  deepStream: '/api/chat-deep/stream',
  searchStream: '/api/search-graph/stream',
  notebookStream: '/api/notebook/qa',
  messages: '/api/chat-service/messages',
  threads: '/api/chat-service/threads',
  summarize: '/api/chat-service/summarize',
  exportMessage: '/api/exports/chat-message',
  exportToDocs: '/api/docs/from-export',
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

  configure: (config?: ChatConfig) => {
    set({
      fetch: config?.fetch ?? defaultFetch,
      onUnauthorized: config?.onUnauthorized ?? defaultOnUnauthorized,
      endpoints: { ...DEFAULT_ENDPOINTS, ...config?.endpoints },
      docsBaseUrl: config?.docsBaseUrl,
      onEditInDocs: config?.onEditInDocs,
    });
  },

  getDocsUrl: () => resolveDocsUrl(get().docsBaseUrl),
}));

export function useChatFetch() {
  return useChatConfigStore((s) => s.fetch);
}

export function useChatEndpoints() {
  return useChatConfigStore((s) => s.endpoints);
}
