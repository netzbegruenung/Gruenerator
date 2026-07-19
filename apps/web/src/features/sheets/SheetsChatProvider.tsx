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
import { chatThreadResponseSchema } from '@gruenerator/contracts';
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
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerDocumentEditHandler(documentId, async (payload) => {
          if (payload.targetDocumentId !== documentId) return;
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
          try {
            const result = await getContractsClient().sheets.ai({
              params: { id: documentId },
              body: {
                userPrompt: payload.userPrompt,
                sheetContext: serializeSheetContext(workbook),
                ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
              },
            });
            if (result.status === 401) {
              // Session died mid-edit. The contracts client already routed this
              // through onUnauthorized (probe → redirect on a dead session); show a
              // clear message instead of the generic failure toast — and never let a
              // transparently-retried write fall through to a false success toast.
              toast.error('Sitzung abgelaufen — bitte neu anmelden.');
              return;
            }
            if (result.status !== 200) {
              toast.error('Tabellen-Aktion fehlgeschlagen.');
              return;
            }
            if (result.body.operations.length === 0) {
              toast.info('Es wurde keine Tabellen-Änderung erkannt — nichts wurde geändert.');
              return;
            }
            const { applied, skipped } = applySheetOperations(workbook, result.body.operations);
            if (applied > 0) {
              // Dedup + short duration: a stable id collapses repeated edits into one
              // toast, and an explicit duration stops sonner from keeping the toast
              // alive (its dismiss timer pauses while the cursor hovers the region,
              // which otherwise piles them up over the composer).
              toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`, {
                id: 'sheet-edit-applied',
                duration: 2000,
              });
            }
            if (skipped.length > 0) {
              toast.warning(skipped.join(' · '));
            }
          } catch (err) {
            toast.error(
              `Tabellen-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
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
