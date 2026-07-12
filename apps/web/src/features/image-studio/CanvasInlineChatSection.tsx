import {
  AssistantRuntimeProvider,
  AuiProvider,
  ExportedMessageRepository,
  useAui,
  useLocalRuntime,
} from '@assistant-ui/react';
import { useCanvasStoreSelector } from '@gruenerator/canvas-editor';
import {
  AUTO_MODEL_ID,
  ChatSurfaceProvider,
  CompactThread,
  CompactWelcome,
  convertToThreadMessageLike,
  createChatSurfaceStore,
  createGrueneratorModelAdapter,
  resolveAutoModel,
  useChatConfigStore,
  type ChatRequestContext,
  type ChatSurfaceStore,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import { chatThreadResponseSchema } from '@gruenerator/contracts';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { useCanvasChatDoc } from './CanvasChatDocContext';

import type { CanvasAiEditBridge, ChatSectionContentProps } from '@gruenerator/canvas-editor';

// Same architecture as the docs/sheets/presentations editors: the main chat
// pipeline (ChatGraph) with a dedicated editor agent. The sharepic text flows
// through the currentDocument context channel; edit intents come back as
// trigger_doc_edit and are executed client-side against the synchronous
// /api/canvas/ai-suggest endpoint — no notebook anywhere.
const AGENT_ID = 'gruenerator-sharepic-editor';

const QUICK_PROMPTS = [
  'Mach das Zitat schlagkräftiger',
  'Kürze den Text',
  'Schlag ein anderes Farbschema vor',
  'Recherchiere passende Fakten dazu',
];

export function CanvasInlineChatSection({
  aiEdit,
  canvasType,
  getSharepicText,
}: ChatSectionContentProps) {
  if (!aiEdit) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
        Chat ist für diese Vorlage nicht verfügbar.
      </div>
    );
  }

  return (
    <CanvasAuiReset>
      <CanvasChatThreadGate
        aiEdit={aiEdit}
        canvasType={canvasType}
        getSharepicText={getSharepicText}
      />
    </CanvasAuiReset>
  );
}

// Fresh AUI scope so the editor chat never shares runtime state with a chat
// surface higher in the tree (same pattern as DocsAuiReset).
function CanvasAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

interface GateProps {
  aiEdit: CanvasAiEditBridge;
  canvasType: string;
  getSharepicText: () => string;
}

function CanvasChatThreadGate({ aiEdit, canvasType, getSharepicText }: GateProps) {
  const chatDoc = useCanvasChatDoc();
  // Template flow (/studio/templates/:type) has no document — a synthetic key
  // still routes the trigger_doc_edit payload back to this editor session.
  const draftId = useId();
  const docKey = chatDoc?.documentId ?? `sharepic-draft-${draftId}`;

  const {
    data: threadId,
    error,
    isLoading,
  } = useQuery({
    // Collab canvases share the docs per-document thread cache key; draft
    // sessions get a one-off thread bound to this mount.
    queryKey: chatDoc
      ? ['docs', chatDoc.documentId, 'chat-thread']
      : ['canvas-draft-chat-thread', docKey],
    queryFn: async () => {
      if (chatDoc) {
        const result = await getContractsClient().docs.getChatThread({
          params: { id: chatDoc.documentId },
        });
        if (result.status !== 200) {
          throw new Error(`Chat thread lookup failed: ${result.status}`);
        }
        return chatThreadResponseSchema.parse(result.body).threadId;
      }
      const result = await getContractsClient().threads.create({
        body: { agentId: AGENT_ID, title: 'Sharepic-Entwurf', threadType: 'chat' },
      });
      if (result.status !== 201) {
        throw new Error(`Thread creation failed: ${result.status}`);
      }
      return result.body.id;
    },
    staleTime: 5 * 60_000,
  });

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
        Chat konnte nicht geladen werden.
      </div>
    );
  }
  if (isLoading || !threadId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
      </div>
    );
  }

  return (
    <CanvasChatReady
      key={threadId}
      threadId={threadId}
      docKey={docKey}
      title={chatDoc?.title ?? null}
      aiEdit={aiEdit}
      canvasType={canvasType}
      getSharepicText={getSharepicText}
    />
  );
}

interface ReadyProps extends GateProps {
  threadId: string;
  docKey: string;
  title: string | null;
}

function CanvasChatReady({
  threadId,
  docKey,
  title,
  aiEdit,
  canvasType,
  getSharepicText,
}: ReadyProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerDocumentEditHandler = useChatConfigStore((s) => s.registerDocumentEditHandler);
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Refs so context provider and edit handler always see the live bridge
  // without re-registering on every render.
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;
  const getTextRef = useRef(getSharepicText);
  getTextRef.current = getSharepicText;
  const setPendingRef = useRef(setPendingAiSuggestion);
  setPendingRef.current = setPendingAiSuggestion;

  const { data: initialMessages } = useQuery({
    queryKey: ['chat-thread-messages', threadId],
    queryFn: async () => {
      const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
      if (!res.ok) return [];
      const parsed = loadedThreadMessagesSchema.parse(await res.json());
      return convertToThreadMessageLike(parsed as Parameters<typeof convertToThreadMessageLike>[0]);
    },
    staleTime: 30_000,
  });

  // Sharepic text rides the same currentDocument channel docs/sheets use, so
  // classifier and respond node work unchanged.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => ({
      currentDocument: {
        id: docKey,
        title: title?.trim() || canvasType,
        markdown: getTextRef.current(),
        selectionText: null,
      },
    });
    return registerContextProvider(threadId, provider);
  }, [threadId, docKey, title, canvasType, registerContextProvider]);

  // Edit handler: ChatGraph classifies edit_current_doc and emits
  // trigger_doc_edit keyed by our docKey — plan operations via the synchronous
  // canvas suggest endpoint and apply them through the aiEdit bridge.
  useEffect(() => {
    return registerDocumentEditHandler(docKey, async (payload) => {
      if (payload.targetDocumentId !== docKey) return;
      setApplying(true);
      setApplyError(null);
      // Auto-accept any prior pending suggestion so the new one isn't
      // shadowed by a stale banner.
      setPendingRef.current(null);
      try {
        const result = await getContractsClient().canvasAi.suggest({
          body: {
            prompt: payload.userPrompt,
            snapshot: aiEditRef.current.getSnapshot(),
            capabilities: aiEditRef.current.capabilityList,
          },
        });
        if (result.status !== 200) {
          setApplyError(
            result.status === 429
              ? 'Zu viele Anfragen — bitte kurz warten.'
              : 'Konnte keinen Bearbeitungs­vorschlag erzeugen.'
          );
          return;
        }
        const first = result.body.suggestions[0];
        if (!first) {
          setApplyError('Keine passende Bearbeitung erkannt.');
          return;
        }
        aiEditRef.current.applyOperations(first.operations);
        setPendingRef.current({ title: first.title });
      } catch (err) {
        setApplyError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      } finally {
        setApplying(false);
      }
    });
  }, [docKey, registerDocumentEditHandler]);

  const surfaceStore = useMemo<ChatSurfaceStore>(
    () =>
      createChatSurfaceStore({
        selectedAgentId: AGENT_ID,
        threadMode: 'chat',
        searchMode: 'web',
      }),
    []
  );

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => {
      const surface = surfaceStore.getState();
      const resolvedModelId =
        surface.selectedModel === AUTO_MODEL_ID
          ? resolveAutoModel({
              threadMode: surface.threadMode,
              agent: surface.selectedAgentId
                ? (getSystemAgent(surface.selectedAgentId) ?? null)
                : null,
            })
          : (surface.selectedModel ?? '');
      return {
        agentId: surface.selectedAgentId ?? AGENT_ID,
        modelId: resolvedModelId,
        enabledTools: {
          search: true,
          web: true,
          examples: true,
          pressemitteilung_examples: false,
          research: false,
        },
        customEnabledTools: {
          edit_current_doc: true,
        },
        threadId: threadIdRef.current,
        threadMode: surface.threadMode,
        searchMode: surface.searchMode,
        selectedNotebookId: surface.selectedNotebookId,
        customSystemPrompt: surface.customSystemPrompt,
        customRoleName: surface.customRoleName,
      };
    },
    [surfaceStore]
  );

  const adapter = useMemo(() => createGrueneratorModelAdapter(getConfig, {}), [getConfig]);
  const runtime = useLocalRuntime(adapter, { initialMessages: initialMessages ?? [] });

  // useLocalRuntime snapshots initialMessages on first render only — import
  // them once they arrive, gated on the runtime being idle and empty.
  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current) return;
    if (!initialMessages || initialMessages.length === 0) return;
    if (runtime.thread.getState().isRunning) return;
    runtime.thread.import(ExportedMessageRepository.fromArray(initialMessages));
    importedRef.current = true;
  }, [initialMessages, runtime]);

  return (
    <ChatSurfaceProvider store={surfaceStore}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-full min-h-0 flex-col">
          <CompactThread
            welcome={
              <CompactWelcome
                icon={<Sparkles className="size-6 text-primary" />}
                description="Stelle Fragen zu deinem Sharepic oder beschreibe direkt eine Änderung. Vorschläge erscheinen direkt am Canvas."
                suggestions={QUICK_PROMPTS}
              />
            }
            assistantIcon={<Sparkles className="size-3.5" />}
            composerPlaceholder="Frage stellen oder Änderung beschreiben…"
          />
          <CanvasEditStatusRow applying={applying} error={applyError} />
        </div>
      </AssistantRuntimeProvider>
    </ChatSurfaceProvider>
  );
}

function CanvasEditStatusRow({ applying, error }: { applying: boolean; error: string | null }) {
  if (applying) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-background-alt px-3 py-1.5 text-[11px] text-foreground-muted">
        <Sparkles className="size-3 animate-pulse text-primary" aria-hidden="true" />
        Bearbeitungs­vorschlag wird erstellt…
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="border-t border-border bg-red-50 px-3 py-1.5 text-[11px] text-red-700"
      >
        Bearbeitung: {error}
      </div>
    );
  }
  return null;
}
