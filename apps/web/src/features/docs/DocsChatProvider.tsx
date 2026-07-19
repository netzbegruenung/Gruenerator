'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: the live document title is mirrored into a ref so the
   memoized adapter's context provider reads a fresh value without rebuilding. */
import {
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema } from '@gruenerator/contracts';
import { invokeDocumentAI, useEditorStore } from '@gruenerator/docs';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMemo, useRef, type ReactNode } from 'react';

import { useDocAiEditEnabled } from './DocAiEditToggle';

const AGENT_ID = 'gruenerator-docs-editor';

/** Docs editor chat state — the shared editor-assistant state. */
export const useDocsChat = useEditorAssistant;

interface DocsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  children: ReactNode;
}

export function DocsChatProvider({
  documentId,
  userId,
  userName,
  documentTitle,
  children,
}: DocsChatProviderProps) {
  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);

  const titleRef = useRef(documentTitle);
  titleRef.current = documentTitle;

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'docs',
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
      getRequestContext: async (): Promise<ChatRequestContext> => {
        const editor = useEditorStore.getState().getEditor(documentId);
        if (!editor) return {};
        return {
          currentDocument: {
            id: documentId,
            title: titleRef.current?.trim() || null,
            markdown: editor.blocksToMarkdownLossy(editor.document),
            selectionText: editor.getSelectedText() || null,
          },
        };
      },
      getTools: (edit) => ({
        enabledTools: {
          search: true,
          web: true,
          examples: true,
          pressemitteilung_examples: false,
          research: true,
        },
        customEnabledTools: {
          summary: true,
          edit_current_doc: edit,
          save_as_doc: true,
          image: true,
          chart: true,
        },
      }),
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerDocumentEditHandler(documentId, async (payload) => {
          if (payload.targetDocumentId !== documentId) return;
          if (!ctx.getAiEditEnabled()) return;
          // The SSE dispatcher only console.warns on handler errors — without a
          // toast here, the chat announces the edit and then silently nothing
          // happens (e.g. network failure or missing edit permission).
          try {
            const invoked = await invokeDocumentAI({
              documentId,
              userPrompt: payload.userPrompt,
              useSelection: payload.useSelection,
              ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
            });
            if (!invoked) throw new Error('no editor mounted for document');
          } catch (err) {
            console.error('[DocsChat] AI document edit failed:', err);
            void import('sonner').then(({ toast }) =>
              toast.error('Die KI-Bearbeitung konnte nicht gestartet werden.')
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
