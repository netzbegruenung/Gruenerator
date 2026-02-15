import { create } from 'zustand';

export interface ChatConfig {
  /** Custom fetch function. Default: fetch with credentials:'include' */
  fetch?: (url: string, options?: RequestInit) => Promise<Response>;
  /** Called on 401. Default: redirect to /login */
  onUnauthorized?: () => void;
  /** API endpoint overrides (all have defaults matching current paths) */
  endpoints?: {
    chatStream?: string;
    deepStream?: string;
    messages?: string;
    threads?: string;
    summarize?: string;
    exportMessage?: string;
    exportToDocs?: string;
  };
  /** Base URL for the Docs app. Auto-detected from hostname if not set. */
  docsBaseUrl?: string;
}

export interface ResolvedEndpoints {
  chatStream: string;
  deepStream: string;
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
}

const DEFAULT_ENDPOINTS: ResolvedEndpoints = {
  chatStream: '/api/chat-graph/stream',
  deepStream: '/api/chat-deep/stream',
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

function defaultOnUnauthorized(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  const currentPath = window.location.pathname + window.location.search;
  window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
}

export const useChatConfigStore = create<ChatConfigStore>((set, get) => ({
  fetch: defaultFetch,
  onUnauthorized: defaultOnUnauthorized,
  endpoints: DEFAULT_ENDPOINTS,
  docsBaseUrl: undefined,

  configure: (config?: ChatConfig) => {
    set({
      fetch: config?.fetch ?? defaultFetch,
      onUnauthorized: config?.onUnauthorized ?? defaultOnUnauthorized,
      endpoints: { ...DEFAULT_ENDPOINTS, ...config?.endpoints },
      docsBaseUrl: config?.docsBaseUrl,
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
