'use client';

import {
  AssistantRuntimeProvider,
  AuiProvider,
  useAui,
  useLocalRuntime,
} from '@assistant-ui/react';
import {
  ChatCollaborationProvider,
  GrueneratorAttachmentAdapter,
  GrueneratorThread,
  convertToThreadMessageLike,
  createGrueneratorModelAdapter,
  useAgentStore,
  useChatCollaboration,
  useChatConfigStore,
  type ChatRequestContext,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import { chatThreadResponseSchema, type ChatThreadResponse } from '@gruenerator/contracts';
import { invokeDocumentAI, useEditorStore } from '@gruenerator/docs';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';

import { DocAiEditToggle, useDocAiEditEnabled } from './DocAiEditToggle';

interface DocsAssistantChatProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
}

/**
 * Resets the AUI context so useLocalRuntime creates a standalone runtime
 * instead of detecting the parent GlobalChatProvider's runtime. Without this,
 * AUI nests and our doc-thread runtime would conflict with the global one.
 * Mirrors NotebookChatProvider's NotebookAuiReset.
 */
function DocsAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

export function DocsAssistantChat({ documentId, userId, userName }: DocsAssistantChatProps) {
  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Bitte melde dich an, um den KI-Assistenten zu nutzen.
      </div>
    );
  }

  return (
    <DocsAuiReset>
      <DocsAssistantChatInner documentId={documentId} userId={userId} userName={userName} />
    </DocsAuiReset>
  );
}

function DocsAssistantChatInner({
  documentId,
  userId,
  userName,
}: {
  documentId: string;
  userId: string;
  userName: string | null;
}) {
  const { data: threadResp } = useQuery<ChatThreadResponse>({
    queryKey: ['docs', documentId, 'chat-thread'],
    queryFn: async () => {
      // Typed ts-rest client — auth via shared axios interceptors. The Zod
      // parse below is defense-in-depth: ts-rest's default config does not
      // validate responses, so a backend shape regression would otherwise
      // pass through silently.
      const result = await getContractsClient().docs.getChatThread({
        params: { id: documentId },
      });
      if (result.status !== 200) {
        throw new Error(`Chat thread lookup failed: ${result.status}`);
      }
      return chatThreadResponseSchema.parse(result.body);
    },
    staleTime: 5 * 60_000,
  });

  const threadId = threadResp?.threadId ?? null;

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Lade Chat...
      </div>
    );
  }

  return (
    <DocsAssistantThreadShell
      key={threadId}
      threadId={threadId}
      documentId={documentId}
      userId={userId}
      userName={userName}
    />
  );
}

/**
 * Wire format for thread messages from /api/chat/messages. Validates the
 * structural skeleton (id/role/content). Metadata is permissive because the
 * package's `convertToThreadMessageLike` reads only specific optional fields
 * (intent, citations, toolCalls, ...) and ignores the rest.
 */
const loadedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const loadedMessagesSchema = z.array(loadedMessageSchema);

function DocsAssistantThreadShell({
  threadId,
  documentId,
  userId,
  userName,
}: {
  threadId: string;
  documentId: string;
  userId: string;
  userName: string | null;
}) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerDocumentEditHandler = useChatConfigStore((s) => s.registerDocumentEditHandler);

  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);
  // Mirror current value into a ref so the stable getConfig closure (memoized
  // once to keep the runtime alive across renders) can read the live setting
  // without forcing the adapter to reinitialize on every toggle.
  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;

  // Load existing messages once (fresh runtime is created with these as
  // initial state). Reloads on hard refresh; live multi-user sync is not
  // wired in v1 — see plan file's "Risks & gotchas".
  const { data: initialMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-thread-messages', threadId],
    queryFn: async () => {
      const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
      if (!res.ok) return [];
      const parsed = loadedMessagesSchema.parse(await res.json());
      // The converter's `LoadedMessage.metadata` is a typed object with specific
      // optional fields (not exported by @gruenerator/chat), so we cast on the
      // already-validated value rather than redefining internal types here.
      return convertToThreadMessageLike(parsed as Parameters<typeof convertToThreadMessageLike>[0]);
    },
    staleTime: 30_000,
  });

  // Per-thread context registry: feed the editor's current markdown + selected
  // text into every outgoing request as the **currentDocument** primary-context
  // field — distinct from `documentChatIds` (retrieval scope for @dokumentchat
  // mentions). Read at request time so edits made between sends are reflected.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => {
      const editor = useEditorStore.getState().getEditor(documentId);
      if (!editor) return {};
      const markdown = editor.blocksToMarkdownLossy(editor.document);
      const selection = editor.getSelectedText() || null;
      return {
        currentDocument: {
          id: documentId,
          title: null,
          markdown,
          selectionText: selection,
        },
      };
    };
    return registerContextProvider(threadId, provider);
  }, [threadId, documentId, registerContextProvider]);

  // Claim the global `selectedAgentId` for this surface's lifetime so the
  // chat header (which reads from useAgentStore, not the runtime adapter
  // config) shows the docs-editor agent — not whichever agent the user last
  // picked in the workplace. Restore the prior value on unmount.
  useEffect(() => {
    const previous = useAgentStore.getState().selectedAgentId;
    useAgentStore.setState({ selectedAgentId: 'gruenerator-docs-editor' });
    return () => {
      useAgentStore.setState({ selectedAgentId: previous });
    };
  }, []);

  // Live document edit dispatcher: when ChatGraph classifies intent as
  // edit_current_doc, the chat backend emits a `trigger_doc_edit` SSE event.
  // We forward it into BlockNote's AIExtension, which runs the existing
  // /api/docs/ai pipeline (tool calls → applyDocumentOperations → Yjs sync →
  // editor undo stack as safety net).
  useEffect(() => {
    return registerDocumentEditHandler(documentId, async (payload) => {
      if (payload.targetDocumentId !== documentId) return;
      // Defense-in-depth: if the user flipped the toggle off mid-flight,
      // ignore the trigger even if the backend still emitted it.
      if (!aiEditEnabledRef.current) return;
      await invokeDocumentAI({
        documentId,
        userPrompt: payload.userPrompt,
        useSelection: payload.useSelection,
        ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
      });
    });
  }, [documentId, registerDocumentEditHandler]);

  // Keep the adapter stable across renders. Without ref-stabilized config the
  // runtime gets recreated on every prop churn and resets streaming state.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => ({
      agentId: 'gruenerator-docs-editor',
      // Empty modelId → backend uses the docs-editor agent's defaultModel.
      // The adapter requires the field but treats falsy values as "no override".
      modelId: '',
      enabledTools: {
        search: true,
        web: true,
        examples: true,
        pressemitteilung_examples: false,
        research: true,
      },
      customEnabledTools: {
        summary: true,
        edit_current_doc: aiEditEnabledRef.current,
        save_as_doc: true,
        image: true,
        chart: true,
      },
      threadId: threadIdRef.current,
      threadMode: 'chat',
    }),
    []
  );

  const adapter = useMemo(() => createGrueneratorModelAdapter(getConfig, {}), [getConfig]);
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: initialMessages ?? [],
    adapters: { attachments: attachmentAdapter },
  });

  // Presence + typing indicators across users on the same doc thread.
  const collabUser = useMemo(() => ({ id: userId, name: userName ?? userId }), [userId, userName]);
  const collab = useChatCollaboration(threadId, collabUser);

  if (messagesLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Lade Verlauf...
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatCollaborationProvider value={collab}>
        <GrueneratorThread
          firstName={userName ?? null}
          density="compact"
          toolbarExtra={<DocAiEditToggle enabled={aiEditEnabled} onToggle={toggleAiEdit} />}
        />
      </ChatCollaborationProvider>
    </AssistantRuntimeProvider>
  );
}
