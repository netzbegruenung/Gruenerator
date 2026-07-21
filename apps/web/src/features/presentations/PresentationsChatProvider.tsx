'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: live deck YDoc + title are mirrored into refs so the
   memoized adapter reads fresh values without rebuilding on every deck update. */
import {
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema, presentationOperationSchema } from '@gruenerator/contracts';
import {
  applyPresentationOperations,
  getSlidesArray,
  serializePresentationContext,
  yMapToSlide,
} from '@gruenerator/presentations';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMemo, useRef, type ReactNode } from 'react';
import { type Doc as YDoc } from 'yjs';

import { useDocAiEditEnabled } from '../docs/DocAiEditToggle';

const AGENT_ID = 'gruenerator-presentations-editor';

/** Presentations editor chat state — the shared editor-assistant state. */
export const usePresentationsChat = useEditorAssistant;

function readSlides(ydoc: YDoc) {
  return getSlidesArray(ydoc)
    .toArray()
    .map((m) => yMapToSlide(m, ydoc));
}

interface PresentationsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  /** Live deck YDoc from the mounted editor (null while loading). */
  ydoc: YDoc | null;
  children: ReactNode;
}

export function PresentationsChatProvider({
  documentId,
  userId,
  userName,
  documentTitle,
  ydoc,
  children,
}: PresentationsChatProviderProps) {
  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);

  const ydocRef = useRef(ydoc);
  ydocRef.current = ydoc;
  const titleRef = useRef(documentTitle);
  titleRef.current = documentTitle;

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'presentation',
      agentId: AGENT_ID,
      targetId: documentId,
      threadQueryKey: ['docs', documentId, 'chat-thread'],
      resolveThreadId: async () => {
        const result = await getContractsClient().docs.getChatThread({
          params: { id: documentId },
        });
        if (result.status !== 200) {
          throw new Error(`Chat thread lookup failed: ${result.status}`);
        }
        return chatThreadResponseSchema.parse(result.body).threadId;
      },
      getRequestContext: (): ChatRequestContext => {
        const doc = ydocRef.current;
        if (!doc) return {};
        return {
          currentDocument: {
            id: documentId,
            title: titleRef.current?.trim() || null,
            markdown: serializePresentationContext(readSlides(doc), titleRef.current?.trim() || ''),
            selectionText: null,
          },
        };
      },
      getTools: (edit) => ({
        enabledTools: {
          search: true,
          web: true,
          examples: false,
          pressemitteilung_examples: false,
          research: true,
        },
        customEnabledTools: {
          summary: true,
          edit_current_doc: edit,
        },
      }),
      // Presentations aren't live yet, so no legacy trigger_doc_edit path to
      // preserve: the loop's edit_document tool plans the ops server-side and
      // streams them as editor_operations; we apply them to the deck's Y.Doc
      // (which flows through collab + the Yjs undo manager).
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerEditorOpsHandler(documentId, async (payload) => {
          if (payload.targetId !== documentId || payload.surface !== 'presentation') return;
          const { toast } = await import('sonner');
          if (!ctx.getAiEditEnabled()) {
            toast.info(
              'KI-Bearbeitung ist deaktiviert — es wurde nichts an der Präsentation geändert.'
            );
            return;
          }
          const doc = ydocRef.current;
          if (!doc) {
            toast.error('Die Präsentation ist noch nicht geladen.');
            return;
          }
          // Defence in depth: the wire carries ops as unknown[]; re-validate each
          // against the op schema so one malformed op drops alone.
          const ops = [];
          for (const raw of payload.operations) {
            const parsed = presentationOperationSchema.safeParse(raw);
            if (parsed.success) ops.push(parsed.data);
          }
          if (ops.length === 0) {
            toast.info('Es wurde keine Folien-Änderung erkannt — nichts wurde geändert.');
            return;
          }
          const { applied, skipped } = applyPresentationOperations(doc, ops);
          if (applied > 0) {
            toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
          }
          if (skipped.length > 0) {
            toast.warning(skipped.join(' · '));
          }
        }),
    }),
    [documentId]
  );

  return (
    <EditorAssistantProvider
      adapter={adapter}
      userId={userId}
      userName={userName}
      aiEditEnabled={aiEditEnabled}
      toggleAiEdit={toggleAiEdit}
    >
      {children}
    </EditorAssistantProvider>
  );
}
