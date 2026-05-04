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
  useChatCollaboration,
  useChatConfigStore,
  useDocumentChatStore,
  type ChatRequestContext,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import {
  chatThreadResponseSchema,
  type ChatThreadResponse,
} from '@gruenerator/contracts';
import { useEditorStore } from '@gruenerator/docs';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';

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
  const addDocToThread = useDocumentChatStore((s) => s.addToThread);

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
      return convertToThreadMessageLike(
        parsed as Parameters<typeof convertToThreadMessageLike>[0]
      );
    },
    staleTime: 30_000,
  });

  // Bind the doc to this thread so the model adapter automatically forwards
  // documentChatIds on every send (see GrueneratorModelAdapter line ~915).
  useEffect(() => {
    addDocToThread(threadId, documentId);
  }, [threadId, documentId, addDocToThread]);

  // Per-thread context registry: feed the editor's current markdown + selected
  // text into every outgoing request as attachmentContext. Read at request
  // time so edits made between sends are reflected.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => {
      const editor = useEditorStore.getState().getEditor(documentId);
      if (!editor) return {};
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      const selection = editor.getSelectedText() || undefined;
      return {
        documentChatIds: [documentId],
        attachmentContext: markdown,
        selectionText: selection,
      };
    };
    return registerContextProvider(threadId, provider);
  }, [threadId, documentId, registerContextProvider]);

  // Keep the adapter stable across renders. Without ref-stabilized config the
  // runtime gets recreated on every prop churn and resets streaming state.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => ({
      agentId: 'gruenerator-universal',
      modelId: 'gemma-4',
      enabledTools: { search: true, web: true, examples: true, research: true },
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
        <GrueneratorThread firstName={userName ?? null} />
      </ChatCollaborationProvider>
    </AssistantRuntimeProvider>
  );
}
