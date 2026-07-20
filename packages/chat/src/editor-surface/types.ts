import type { AssistantRuntime } from '@assistant-ui/react';

import type { ChatRequestContextProvider } from '../stores/chatConfigStore';
import type { GrueneratorAdapterConfig } from '../runtime/GrueneratorModelAdapter';

/** The five embedded editor surfaces that host an agentic chat sidebar. */
export type EditorSurfaceKind = 'docs' | 'presentation' | 'sheet' | 'board' | 'canvas';

/** Tool availability the surface exposes, as a function of the live AI-edit toggle. */
export interface EditorToolConfig {
  enabledTools: GrueneratorAdapterConfig['enabledTools'];
  customEnabledTools: GrueneratorAdapterConfig['customEnabledTools'];
}

/**
 * Context handed to {@link EditorSurfaceAdapter.registerEditHandler}. The shared
 * provider owns the resolved thread id and the live AI-edit toggle; the surface
 * closure captures its own live editor handles (ydoc / univerAPI / bridge).
 */
export interface EditorRegistrationCtx {
  threadId: string;
  /** Reads the current AI-edit toggle (surfaces gate their apply on this). */
  getAiEditEnabled: () => boolean;
}

/**
 * Per-surface configuration for {@link EditorAssistantProvider}. Everything that
 * differs between docs / sheets / presentations / boards / canvas lives here and
 * is owned by the feature (serializers, apply logic, agent id, thread
 * resolution). The provider owns the ~90% that is identical: AUI reset, thread
 * bootstrap, runtime creation, history import, context-provider registration,
 * collaboration, and the ready/loading/error/guest state machine.
 *
 * Built in the feature with `useMemo` and the "latest ref" pattern so long-lived
 * closures read fresh editor state without re-registering on every update.
 */
export interface EditorSurfaceAdapter {
  surface: EditorSurfaceKind;
  /** Default agent id for the surface's scoped store (e.g. `gruenerator-docs-editor`). */
  agentId: string;
  /** Key that edit/ops handlers register under — documentId | boardId | draft docKey. */
  targetId: string;
  /** react-query cache key for the thread lookup (kept stable per surface). */
  threadQueryKey: readonly unknown[];
  /** Resolves (or lazily creates) the chat thread id for this surface. */
  resolveThreadId: () => Promise<string>;
  /** Live per-request context (currentDocument | currentBoard). */
  getRequestContext: ChatRequestContextProvider;
  /** Tool toggles as a function of the live AI-edit toggle. */
  getTools: (aiEditEnabled: boolean) => EditorToolConfig;
  /**
   * Registers the surface's live-edit handler(s) against the chat config store
   * (documentEditHandlers for docs/sheets/presentations/canvas, boardActionHandlers
   * for boards). Returns an unregister function. Called once per resolved thread.
   */
  registerEditHandler: (ctx: EditorRegistrationCtx) => () => void;
  /** Peer sync + presence. Default true; canvas passes false (draft threads). */
  collaboration?: boolean;
  /** Composer attachment adapter. Default true; canvas passes false. */
  attachments?: boolean;
}

/** State exposed by {@link useEditorAssistant}, consumed by each surface's view. */
export type EditorAssistantState =
  | { status: 'guest' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | {
      status: 'ready';
      threadId: string;
      runtime: AssistantRuntime;
      /** documentId | boardId | draft docKey — for surface-specific composer chrome. */
      targetId: string;
      userName: string | null;
      aiEditEnabled: boolean;
      toggleAiEdit: () => void;
    };
