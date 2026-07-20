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
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Sparkles } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { useCanvasChatDoc } from './CanvasChatDocContext';

import type { CanvasAiEditBridge, ChatSectionContentProps } from '@gruenerator/canvas-editor';

// Same architecture as the docs/sheets/presentations editors: the main chat
// pipeline (ChatGraph) with a dedicated editor agent. The sharepic text flows
// through the currentDocument context channel; edit intents come back as
// trigger_doc_edit and are executed client-side against the synchronous
// /api/canvas/ai-suggest endpoint — no notebook anywhere.
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
  // still routes the trigger_doc_edit payload back to this editor session.
  const draftId = useId();
  const docKey = chatDoc?.documentId ?? `sharepic-draft-${draftId}`;
  const setPendingAiSuggestion = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Refs so the memoized adapter's handlers always see live values.
  const aiEditRef = useRef(aiEdit);
  aiEditRef.current = aiEdit;
  const getTextRef = useRef(getSharepicText);
  getTextRef.current = getSharepicText;
  const setPendingRef = useRef(setPendingAiSuggestion);
  setPendingRef.current = setPendingAiSuggestion;
  const titleRef = useRef(chatDoc?.title ?? null);
  titleRef.current = chatDoc?.title ?? null;
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
      getRequestContext: (): ChatRequestContext => ({
        currentDocument: {
          id: docKey,
          title: titleRef.current?.trim() || canvasTypeRef.current,
          markdown: getTextRef.current(),
          selectionText: null,
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
          edit_current_doc: true,
        },
      }),
      registerEditHandler: () =>
        useChatConfigStore.getState().registerDocumentEditHandler(docKey, async (payload) => {
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
                // Chat loop's gathered research ("recherchiere X und bau es ins
                // Sharepic ein") — grounds the suggestion in the found facts.
                ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
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
    </EditorAssistantProvider>
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
