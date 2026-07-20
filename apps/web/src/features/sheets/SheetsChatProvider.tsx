'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: the live Univer facade is mirrored into a ref so the
   memoized adapter reads a fresh value without rebuilding on every edit. */
import {
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { chatThreadResponseSchema, sheetOperationSchema } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { applySheetOperations, serializeSheetContext, type FUniver } from '@gruenerator/sheets';
import { useMemo, useRef, type ReactNode } from 'react';

import { useDocAiEditEnabled } from '../docs/DocAiEditToggle';

const AGENT_ID = 'gruenerator-sheets-editor';

/** Sheets editor chat state — the shared editor-assistant state. */
export const useSheetsChat = useEditorAssistant;

interface SheetsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  /** Live Univer facade from the mounted editor (null while loading). */
  univerAPI: FUniver | null;
  children: ReactNode;
}

export function SheetsChatProvider({
  documentId,
  userId,
  userName,
  documentTitle,
  univerAPI,
  children,
}: SheetsChatProviderProps) {
  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);

  const univerAPIRef = useRef(univerAPI);
  univerAPIRef.current = univerAPI;
  const titleRef = useRef(documentTitle);
  titleRef.current = documentTitle;

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'sheet',
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
        const workbook = univerAPIRef.current?.getActiveWorkbook();
        if (!workbook) return {};
        return {
          currentDocument: {
            id: documentId,
            title: titleRef.current?.trim() || null,
            markdown: serializeSheetContext(workbook),
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
      // Sheets aren't live yet, so there's no legacy trigger_doc_edit path to
      // preserve: the loop's edit_document tool plans the ops server-side and
      // streams them as editor_operations, and we apply them in place via the
      // Univer Facade (which flows through the collab bridge + native undo).
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerEditorOpsHandler(documentId, async (payload) => {
          if (payload.targetId !== documentId || payload.surface !== 'sheet') return;
          const { toast } = await import('sonner');
          if (!ctx.getAiEditEnabled()) {
            toast.info('KI-Bearbeitung ist deaktiviert — es wurde nichts an der Tabelle geändert.');
            return;
          }
          const workbook = univerAPIRef.current?.getActiveWorkbook();
          if (!workbook) {
            toast.error('Die Tabelle ist noch nicht geladen.');
            return;
          }
          // Defence in depth: the wire carries ops as unknown[]; re-validate each
          // against the op schema so one malformed op drops alone.
          const ops = [];
          for (const raw of payload.operations) {
            const parsed = sheetOperationSchema.safeParse(raw);
            if (parsed.success) ops.push(parsed.data);
          }
          if (ops.length === 0) {
            toast.info('Es wurde keine Tabellen-Änderung erkannt — nichts wurde geändert.');
            return;
          }
          const { applied, skipped } = await applySheetOperations(
            workbook,
            ops,
            univerAPIRef.current ?? undefined
          );
          if (applied > 0) {
            // Dedup + short duration: a stable id collapses repeated edits into one
            // toast, and an explicit duration stops sonner from keeping the toast
            // alive over the composer.
            toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`, {
              id: 'sheet-edit-applied',
              duration: 2000,
            });
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
