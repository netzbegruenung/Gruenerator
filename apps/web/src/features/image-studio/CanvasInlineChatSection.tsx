'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: the live canvas bridge + text getter are mirrored into
   refs so the memoized adapter's edit handler reads fresh values. */
import { useCanvasStoreSelector } from '@gruenerator/canvas-editor';
import {
  CompactThread,
  CompactWelcome,
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { Sparkles } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { applyCanvasEditorOps } from './applyCanvasEditorOps';
import { useCanvasChatDoc } from './CanvasChatDocContext';

import type { CanvasAiEditBridge, ChatSectionContentProps } from '@gruenerator/canvas-editor';

// Same architecture as the sheets/presentations/boards editors: the main chat
// pipeline (ChatGraph) with a dedicated editor agent, editing through the
// agentic loop's `edit_document` tool (plan-and-send). The sharepic text,
// snapshot and capabilities flow up through the `currentCanvas` context
// channel; the planned ops come back as an `editor_operations` SSE event and
// are applied to the live canvas here — no notebook anywhere.
const AGENT_ID = 'gruenerator-sharepic-editor';

// Canvas chat is only mounted inside the (authed) studio and never collaborates,
// so a stable sentinel satisfies the provider's render gate without a real user.
const CANVAS_USER_ID = 'canvas-editor';

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
    <CanvasChatInner aiEdit={aiEdit} canvasType={canvasType} getSharepicText={getSharepicText} />
  );
}

interface InnerProps {
  aiEdit: CanvasAiEditBridge;
  canvasType: string;
  getSharepicText: () => string;
}

function CanvasChatInner({ aiEdit, canvasType, getSharepicText }: InnerProps) {
  const chatDoc = useCanvasChatDoc();
  // Template flow (/studio/templates/:type) has no document — a synthetic key
  // still routes the editor_operations payload back to this editor session.
  const draftId = useId();
  const docKey = chatDoc?.documentId ?? `sharepic-draft-${draftId}`;
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  const [applyError, setApplyError] = useState<string | null>(null);

  // Refs so the memoized adapter's handlers always see live values.
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;
  const getTextRef = useRef(getSharepicText);
  getTextRef.current = getSharepicText;
  const setPendingRef = useRef(setPendingAiSuggestion);
  setPendingRef.current = setPendingAiSuggestion;
  const canvasTypeRef = useRef(canvasType);
  canvasTypeRef.current = canvasType;

  const chatDocId = chatDoc?.documentId ?? null;

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'canvas',
      agentId: AGENT_ID,
      targetId: docKey,
      collaboration: false,
      attachments: false,
      // Collab canvases share the docs per-document thread cache key; draft
      // sessions get a one-off thread bound to this mount.
      threadQueryKey: chatDocId
        ? ['docs', chatDocId, 'chat-thread']
        : ['canvas-draft-chat-thread', docKey],
      resolveThreadId: async () => {
        if (chatDocId) {
          const result = await getContractsClient().docs.getChatThread({
            params: { id: chatDocId },
          });
          if (result.status !== 200) {
            throw new ApiError(result.status, `Chat thread lookup failed: ${result.status}`);
          }
          return chatThreadResponseSchema.parse(result.body).threadId;
        }
        const result = await getContractsClient().threads.create({
          body: { agentId: AGENT_ID, title: 'Sharepic-Entwurf', threadType: 'chat' },
        });
        if (result.status !== 201) {
          throw new ApiError(result.status, `Thread creation failed: ${result.status}`);
        }
        return result.body.id;
      },
      getRequestContext: (): ChatRequestContext => ({
        currentCanvas: {
          id: docKey,
          template: canvasTypeRef.current,
          snapshot: aiEditRef.current.getSnapshot(),
          capabilities: aiEditRef.current.capabilityList,
          text: getTextRef.current(),
        },
      }),
      getTools: () => ({
        enabledTools: {
          search: true,
          web: true,
          examples: true,
          pressemitteilung_examples: false,
          research: false,
        },
        customEnabledTools: {
          edit_current_canvas: true,
        },
      }),
      // Tool-based edit: the loop's edit_document tool plans the ops
      // server-side (runCanvasSuggest) and streams them as editor_operations;
      // we apply them to the live canvas and raise the Behalten/Verwerfen
      // banner. Replaces the old trigger_doc_edit → /api/canvas/ai-suggest
      // round-trip.
      registerEditHandler: () =>
        useChatConfigStore.getState().registerEditorOpsHandler(docKey, (payload) => {
          try {
            const outcome = applyCanvasEditorOps(payload, {
              docKey,
              applyOperations: (ops) => {
                aiEditRef.current.applyOperations(ops);
              },
              setPending: (pending) => setPendingRef.current(pending),
            });
            // Another target's or another surface's event — several editor
            // sidebars share the store, so leave this one's state alone.
            if (outcome.status === 'ignored') return;
            // Reset on every event we DO handle, so a stale error cannot stand
            // under a later successful edit.
            setApplyError(
              outcome.status === 'no_valid_ops' ? 'Keine passende Bearbeitung erkannt.' : null
            );
          } catch (err) {
            setApplyError(err instanceof Error ? err.message : 'Unbekannter Fehler');
          }
        }),
    }),
    [docKey, chatDocId]
  );

  return (
    <EditorAssistantProvider
      adapter={adapter}
      userId={CANVAS_USER_ID}
      userName={null}
      aiEditEnabled
    >
      <CanvasChatSurface applyError={applyError} />
    </EditorAssistantProvider>
  );
}

function CanvasChatNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-foreground-muted">
      {children}
    </div>
  );
}

/**
 * The thread only mounts once the provider reports `ready`. Before that there is
 * no AssistantRuntimeProvider inside the isolated AUI scope — `ThreadPrimitive`
 * reads `s.thread` unguarded and throws "The current scope does not have a
 * 'thread' property", which took the whole canvas editor down while the thread
 * id was still being resolved. Same gate as the docs/sheets/boards sidebars.
 */
function CanvasChatSurface({ applyError }: { applyError: string | null }) {
  const state = useEditorAssistant();

  if (state.status === 'guest') {
    return (
      <CanvasChatNotice>Bitte melde dich an, um den KI-Assistenten zu nutzen.</CanvasChatNotice>
    );
  }
  if (state.status === 'loading') {
    return <CanvasChatNotice>Chat wird geladen…</CanvasChatNotice>;
  }
  if (state.status === 'error') {
    return (
      <CanvasChatNotice>Chat konnte nicht geladen werden: {state.error.message}</CanvasChatNotice>
    );
  }

  return (
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
      <CanvasEditStatusRow error={applyError} />
    </div>
  );
}

/**
 * Only an error row now. The "wird erstellt…" state belonged to the old client
 * POST to /api/canvas/ai-suggest; the ops arrive pre-planned from the loop and
 * apply synchronously, so a progress flag here would never render a frame —
 * the loop's tool card is what shows that work.
 */
function CanvasEditStatusRow({ error }: { error: string | null }) {
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
