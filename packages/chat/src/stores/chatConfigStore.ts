import { create } from 'zustand';

import type { SharepicVariant } from '../hooks/useChatGraphStream';
import type {
  ClientPlatform,
  CurrentBoard,
  EditorOperationsEvent,
  RoleRef,
} from '@gruenerator/contracts';

/** A raw file handed to the in-browser Python interpreter (Pyodide worker). */
export interface PythonFile {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

/** Result of executing Python in the browser (Pyodide worker). */
export interface CodeExecutionResult {
  ok: boolean;
  stdout: string;
  /** base64-encoded PNGs (no `data:` prefix) of matplotlib figures. */
  figures: string[];
  /** Files the code wrote to the working directory (exports like
   *  df.to_csv('export.csv')) — collected by the harness, capped at
   *  5 files / 10 MB total. */
  files: Array<{ name: string; base64: string }>;
  /** Short error summary (e.g. "KeyError: 'x'"), null on success. */
  error: string | null;
  /** Full Python traceback, null on success. */
  traceback: string | null;
  durationMs: number;
}

export interface RunPythonOptions {
  timeoutMs?: number;
  onProgress?: (message: string) => void;
}

/**
 * Runs Python in a browser Pyodide worker. The actual implementation lives in
 * apps/web (worker + wheels); packages/chat only knows the signature and
 * receives it via {@link ChatConfig.runPython}.
 */
export type RunPython = (
  code: string,
  files?: PythonFile[],
  options?: RunPythonOptions
) => Promise<CodeExecutionResult>;

export interface ChatConfig {
  /** Custom fetch function. Default: fetch with credentials:'include' */
  fetch?: (url: string, options?: RequestInit) => Promise<Response>;
  /**
   * Called on 401. A truthy (Promise-)return means "the session was probed and
   * is actually alive — retry the request once" (web routes this through the
   * shared handleUnauthorized authority); void/false means "don't retry".
   * Default: redirect to /login.
   */
  onUnauthorized?: () => void | boolean | Promise<boolean | void>;
  /** Client shell sent with chat requests; unset means 'web'. */
  platform?: ClientPlatform;
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
    exportPdf?: string;
    exportToDocs?: string;
    chatConfirm?: string;
    feedback?: string;
    mcpApps?: string;
  };
  /** Base URL for the Docs app. Auto-detected from hostname if not set. */
  docsBaseUrl?: string;
  /** Optional override for the "Edit in Docs" action. If unset, MessageActions falls back to opening `${getDocsUrl()}/document/${id}` in a new tab. Returns documentId for reuse. */
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
  /**
   * Exports a message as a PDF carrying the user's Absender — the letterhead
   * document and the DIN 5008 letter, which the same dialog decides between.
   * Injected rather than built into the chat package: choosing the Absender
   * needs the saved letterheads and the export dialog, both of which live in
   * the host app. Omit it and the menu entry is not offered — that is how
   * mobile hides a flow it has no dialog for.
   */
  onExportPdfLetterhead?: (content: string, title?: string) => Promise<void>;
  /** Opens a single sharepic variant in the canvas editor for editing. */
  onEditSharepic?: (variant: SharepicVariant, opts?: { threadId: string | null }) => void;
  /** Renders a sharepic to a base64 PNG using the canvas editor. */
  renderSharepic?: (
    canvasType: string,
    initialProps: Record<string, unknown>
  ) => Promise<string | null>;
  /** Runs Python in a browser Pyodide worker (in-chat code execution). */
  runPython?: RunPython;
  /** Current state of a chat-edited sharepic canvas (GET /api/canvas/:id/state). */
  fetchSharepicState?: (canvasId: string) => Promise<{
    state: Record<string, unknown>;
    version: number | null;
    /** Per-slide states for multi-page (deck) canvases. */
    pages?: Array<Record<string, unknown>> | null;
  } | null>;
  /** Chat-edit version history of a canvas, newest first. */
  fetchSharepicVersions?: (
    canvasId: string
  ) => Promise<Array<{ version: number; summary: string | null; created_at: string }>>;
  /** One version's full state (for the card's version stepper preview). */
  fetchSharepicVersionState?: (
    canvasId: string,
    version: number
  ) => Promise<Record<string, unknown> | null>;
  /** Restores a version (re-applied as a new version); returns the new head. */
  restoreSharepicVersion?: (
    canvasId: string,
    version: number
  ) => Promise<{ version: number; state: Record<string, unknown> } | null>;
  /**
   * Persists a freshly rendered PNG (data URL) as the canvas document's
   * thumbnail after a chat edit, so galleries don't keep showing the mint
   * state. Best-effort — failures must not surface in the chat UI.
   */
  updateSharepicThumbnail?: (canvasId: string, imageDataUrl: string) => Promise<void>;
  /**
   * Bundles rendered slide PNGs (data URLs) into a ZIP download (deck
   * variants). Platform-specific — web posts to /api/exports/zip.
   */
  downloadSharepicZip?: (images: string[], canvasType: string) => Promise<void>;
  /**
   * URL the @wolke picker links to when the user hasn't connected any
   * Nextcloud share link yet. Platform-specific (web: `/wolke`, native: a deep
   * link). Omit to hide the CTA — only the warning copy renders.
   */
  wolkeConnectUrl?: string;
  /**
   * Href des Chunk-Inspektors zu einer Zitation, oder `null` für „nicht
   * anzeigen". Die Host-App entscheidet darin auch, ob die angemeldete Person
   * Instanz-Admin ist — packages/chat kennt weder die Rolle noch die Route.
   * Weggelassen (mobil) blendet den Eintrag aus.
   */
  chunkInspectorHref?: (target: {
    documentId: string;
    collectionId: string;
    chunkIndex: number;
  }) => string | null;
  /**
   * Uploads a composer-attached video to the subtitler TUS endpoint and
   * resolves with its uploadId. Required for video attachments — without it
   * the attachment adapter rejects video files. The abort handle terminates
   * the transfer (and deletes the partial server-side upload) when the user
   * removes the attachment mid-upload.
   */
  uploadReelVideo?: (
    file: File,
    onProgress?: (pct: number) => void
  ) => { promise: Promise<{ uploadId: string }>; abort: () => void };
  /** Streaming URL for a subtitler project's video (cookie-authed, Range-capable). */
  getReelVideoUrl?: (projectId: string) => string;
  /** Fetch one subtitler project incl. its subtitles blob; null on error. */
  fetchReelProject?: (
    projectId: string
  ) => Promise<{ title: string; subtitles: string | null } | null>;
  /** Poll the auto-processing pipeline for a chat-uploaded video. */
  fetchReelAutoProgress?: (uploadId: string) => Promise<{
    status: 'processing' | 'complete' | 'error' | 'not_found';
    overallProgress: number;
    projectId: string | null;
    subtitles: string | null;
    error: string | null;
  } | null>;
  /** Opens a subtitler project in the Sub-Studio (web: /reel/studio deep link). */
  onOpenReelStudio?: (projectId: string) => void;
  /**
   * Speichert die Rolle, mit der neue Chats starten, in den Konto-Einstellungen
   * der Person (`profile.activeRole`). Injiziert, weil die Nutzer-Voreinstellungen
   * in der Host-App liegen; ohne sie merkt sich der Composer die Wahl nur für
   * die Sitzung. Fehlschläge dürfen im Chat nicht auftauchen.
   */
  persistActiveRole?: (role: RoleRef | null) => void;
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
  exportPdf: string;
  exportToDocs: string;
  chatConfirm: string;
  feedback: string;
  /** MCP-Apps widget bridge base (read-resource / tools/call / resources/*). */
  mcpApps: string;
}

interface ResolvedChatConfig {
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  onUnauthorized: () => void | boolean | Promise<boolean | void>;
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
  /**
   * The live board the user is editing — primary context when chat is embedded
   * in the boards editor. Serialized from the live Yjs board each request.
   */
  currentBoard?: CurrentBoard;
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
  // Prior chat assistant content the user references with "dies"/"das"/
  // "im dokument einfügen". Forwarded to BlockNote AI as system-prompt
  // context — never concatenated into userPrompt.
  referenceContent?: string;
}

export type DocumentEditTriggerHandler = (
  payload: DocumentEditTriggerPayload
) => void | Promise<void>;

/**
 * Handler the boards-editor surface registers to receive `trigger_board_action`
 * SSE events. The handler calls POST /api/boards/:id/ai to plan operations and
 * applies them to the live Yjs board via the client-side executor.
 */
export interface BoardActionTriggerPayload {
  targetBoardId: string;
  userPrompt: string;
  referenceContent?: string;
}

export type BoardActionTriggerHandler = (
  payload: BoardActionTriggerPayload
) => void | Promise<void>;

/**
 * Handler an editor surface registers to receive `editor_operations` SSE events
 * — the tool-based edit path (CHAT_EDIT_TOOL_SURFACES). The agentic loop planned
 * the ops server-side; the handler applies them in place (Univer / Yjs / Konva)
 * via the surface's bridge. Keyed by targetId (documentId | boardId | docKey),
 * parallel to documentEditHandlers so the legacy trigger path stays as fallback.
 */
export type EditorOperationsHandler = (payload: EditorOperationsEvent) => void | Promise<void>;

interface ChatConfigStore extends ResolvedChatConfig {
  configure: (config?: ChatConfig) => void;
  getDocsUrl: () => string;
  onEditInDocs?: (
    content: string,
    title?: string,
    existingDocId?: string
  ) => Promise<string | void>;
  onExportPdfLetterhead?: ChatConfig['onExportPdfLetterhead'];
  onEditSharepic?: (variant: SharepicVariant, opts?: { threadId: string | null }) => void;
  renderSharepic?: (
    canvasType: string,
    initialProps: Record<string, unknown>
  ) => Promise<string | null>;
  runPython?: RunPython;
  fetchSharepicState?: ChatConfig['fetchSharepicState'];
  fetchSharepicVersions?: ChatConfig['fetchSharepicVersions'];
  fetchSharepicVersionState?: ChatConfig['fetchSharepicVersionState'];
  restoreSharepicVersion?: ChatConfig['restoreSharepicVersion'];
  updateSharepicThumbnail?: ChatConfig['updateSharepicThumbnail'];
  downloadSharepicZip?: ChatConfig['downloadSharepicZip'];
  uploadReelVideo?: ChatConfig['uploadReelVideo'];
  getReelVideoUrl?: ChatConfig['getReelVideoUrl'];
  fetchReelProject?: ChatConfig['fetchReelProject'];
  fetchReelAutoProgress?: ChatConfig['fetchReelAutoProgress'];
  onOpenReelStudio?: ChatConfig['onOpenReelStudio'];
  persistActiveRole?: ChatConfig['persistActiveRole'];
  platform?: ChatConfig['platform'];
  /** URL the @wolke empty-state CTA opens (new tab). Hidden when unset. */
  wolkeConnectUrl?: string;
  /** Href des Chunk-Inspektors zu einer Zitation; null/unset blendet ihn aus. */
  chunkInspectorHref?: ChatConfig['chunkInspectorHref'];
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
  /** boardId → board-action dispatcher (boards editor surface only). */
  boardActionHandlers: Map<string, BoardActionTriggerHandler>;
  /** Register a board-action handler for a board. Returns the unregister function. */
  registerBoardActionHandler: (boardId: string, handler: BoardActionTriggerHandler) => () => void;
  /** targetId → editor_operations dispatcher (tool-based edit path). */
  editorOpsHandlers: Map<string, EditorOperationsHandler>;
  /** Register an editor-operations handler for a target. Returns the unregister function. */
  registerEditorOpsHandler: (targetId: string, handler: EditorOperationsHandler) => () => void;
  /**
   * Transient signal set by the regenerate / edit-resubmit UI and consumed once
   * by the model adapter on the next run. Tells the backend to replace the last
   * turn instead of appending it (keeps chat_messages linear). Scoped to a
   * threadId so a stale signal can't leak into another thread's run.
   */
  pendingRunSignal: {
    threadId: string;
    regenerate?: boolean;
    replaceFromMessageId?: string;
  } | null;
  /** Flag the next run as a regenerate of the thread's last assistant turn. */
  signalRegenerate: (threadId: string) => void;
  /** Flag the next run as an edit-resubmit starting from a persisted message. */
  signalEditResubmit: (threadId: string, messageId: string) => void;
  /** Read + clear the pending signal for a thread (no-op for other threads). */
  consumeRunSignals: (threadId: string | undefined) => {
    regenerate: boolean;
    replaceFromMessageId: string | undefined;
  };
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
  exportPdf: '/api/exports/pdf',
  exportToDocs: '/api/docs/from-export',
  chatConfirm: '/api/chat-service/confirm',
  feedback: '/api/chat-service/feedback',
  mcpApps: '/api/mcp-apps',
};

function resolveDocsUrl(configured?: string): string {
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//localhost:3002`;
  }
  // Desktop (Tauri) webview: hostname is `localhost` under origin
  // `tauri://localhost`, so `doku.${hostname}` is wrong — use the public docs host.
  if ('__TAURI__' in window) {
    return 'https://doku.gruenerator.eu';
  }
  // `doku.`, not `docs.`: the `docs.` host 301s to the main app, which serves
  // the SPA shell for `/docs/*` — deep links render the app, not the page.
  return `${window.location.protocol}//doku.${hostname}`;
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
  onExportPdfLetterhead: undefined,
  wolkeConnectUrl: undefined,
  chunkInspectorHref: undefined,
  contextProviders: new Map(),
  documentEditHandlers: new Map(),
  boardActionHandlers: new Map(),
  editorOpsHandlers: new Map(),
  pendingRunSignal: null,

  configure: (config?: ChatConfig) => {
    set({
      fetch: config?.fetch ?? defaultFetch,
      onUnauthorized: config?.onUnauthorized ?? defaultOnUnauthorized,
      endpoints: { ...DEFAULT_ENDPOINTS, ...config?.endpoints },
      docsBaseUrl: config?.docsBaseUrl,
      onEditInDocs: config?.onEditInDocs,
      onExportPdfLetterhead: config?.onExportPdfLetterhead,
      onEditSharepic: config?.onEditSharepic,
      renderSharepic: config?.renderSharepic,
      runPython: config?.runPython,
      fetchSharepicState: config?.fetchSharepicState,
      fetchSharepicVersions: config?.fetchSharepicVersions,
      fetchSharepicVersionState: config?.fetchSharepicVersionState,
      restoreSharepicVersion: config?.restoreSharepicVersion,
      updateSharepicThumbnail: config?.updateSharepicThumbnail,
      downloadSharepicZip: config?.downloadSharepicZip,
      uploadReelVideo: config?.uploadReelVideo,
      getReelVideoUrl: config?.getReelVideoUrl,
      fetchReelProject: config?.fetchReelProject,
      fetchReelAutoProgress: config?.fetchReelAutoProgress,
      onOpenReelStudio: config?.onOpenReelStudio,
      persistActiveRole: config?.persistActiveRole,
      platform: config?.platform,
      wolkeConnectUrl: config?.wolkeConnectUrl,
      chunkInspectorHref: config?.chunkInspectorHref,
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

  registerBoardActionHandler: (boardId, handler) => {
    const next = new Map(get().boardActionHandlers);
    next.set(boardId, handler);
    set({ boardActionHandlers: next });
    return () => {
      const after = new Map(get().boardActionHandlers);
      if (after.get(boardId) === handler) {
        after.delete(boardId);
        set({ boardActionHandlers: after });
      }
    };
  },

  registerEditorOpsHandler: (targetId, handler) => {
    const next = new Map(get().editorOpsHandlers);
    next.set(targetId, handler);
    set({ editorOpsHandlers: next });
    return () => {
      const after = new Map(get().editorOpsHandlers);
      if (after.get(targetId) === handler) {
        after.delete(targetId);
        set({ editorOpsHandlers: after });
      }
    };
  },

  signalRegenerate: (threadId) => set({ pendingRunSignal: { threadId, regenerate: true } }),

  signalEditResubmit: (threadId, messageId) =>
    set({ pendingRunSignal: { threadId, replaceFromMessageId: messageId } }),

  consumeRunSignals: (threadId) => {
    const signal = get().pendingRunSignal;
    if (!signal || !threadId || signal.threadId !== threadId) {
      return { regenerate: false, replaceFromMessageId: undefined };
    }
    set({ pendingRunSignal: null });
    return {
      regenerate: signal.regenerate ?? false,
      replaceFromMessageId: signal.replaceFromMessageId,
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
