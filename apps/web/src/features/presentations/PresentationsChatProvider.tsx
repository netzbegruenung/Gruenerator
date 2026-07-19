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
import { chatThreadResponseSchema } from '@gruenerator/contracts';
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
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerDocumentEditHandler(documentId, async (payload) => {
          if (payload.targetDocumentId !== documentId) return;
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
          try {
            const result = await getContractsClient().presentations.ai({
              params: { id: documentId },
              body: {
                userPrompt: payload.userPrompt,
                presentationContext: serializePresentationContext(
                  readSlides(doc),
                  titleRef.current?.trim() || ''
                ),
                ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
              },
            });
            if (result.status !== 200) {
              toast.error('Folien-Aktion fehlgeschlagen.');
              return;
            }
            if (result.body.operations.length === 0) {
              toast.info('Es wurde keine Folien-Änderung erkannt — nichts wurde geändert.');
              return;
            }
            const { applied, skipped } = applyPresentationOperations(doc, result.body.operations);
            if (applied > 0) {
              toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
            }
            if (skipped.length > 0) {
              toast.warning(skipped.join(' · '));
            }
          } catch (err) {
            toast.error(
              `Folien-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
            );
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
