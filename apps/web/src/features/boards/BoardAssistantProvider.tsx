'use client';

/* eslint-disable react-hooks/refs --
   Latest-ref pattern: live Yjs/board state is mirrored into refs (assigned during
   render) so the long-lived board action handler reads fresh values without
   re-registering on every board update. */
import {
  EditorAssistantProvider,
  useChatConfigStore,
  useEditorAssistant,
  type ChatRequestContext,
  type EditorSurfaceAdapter,
} from '@gruenerator/chat';
import { boardOperationSchema, chatThreadResponseSchema } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { applyBoardOperations, type BoardMutations } from './applyBoardOperations';
import { useBoardAiEditEnabled } from './BoardAiEditToggle';
import { useAssignableMembers } from './hooks/useAssignableMembers';
import { serializeBoardForChat } from './utils/serializeBoardContext';

const AGENT_ID = 'gruenerator-boards-editor';

/** Board editor chat state — the shared editor-assistant state. */
export const useBoardChat = useEditorAssistant;

interface BoardAssistantProviderProps {
  boardId: string;
  userId: string | null;
  userName: string | null;
  boardTitle: string | null;
  boardState: BoardMutations;
  /** Active view's grouping field — column/status ops target this field. */
  groupByFieldId?: string;
  children: ReactNode;
}

export function BoardAssistantProvider({
  boardId,
  userId,
  userName,
  boardTitle,
  boardState,
  groupByFieldId,
  children,
}: BoardAssistantProviderProps) {
  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useBoardAiEditEnabled(boardId);
  const queryClient = useQueryClient();
  const { data: assignableMembers } = useAssignableMembers(userId ? boardId : undefined);

  // Refs so the long-lived board action handler always reads fresh live state.
  const boardStateRef = useRef(boardState);
  boardStateRef.current = boardState;
  const boardTitleRef = useRef(boardTitle);
  boardTitleRef.current = boardTitle;
  const groupByFieldIdRef = useRef(groupByFieldId);
  groupByFieldIdRef.current = groupByFieldId;
  const membersRef = useRef(assignableMembers ?? []);
  membersRef.current = assignableMembers ?? [];

  // Promise-based delete confirmation rendered as an AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    titles: string[];
    resolve: (ok: boolean) => void;
  } | null>(null);
  const confirmDelete = useCallback((titles: string[]): Promise<boolean> => {
    return new Promise<boolean>((resolve) => setPendingDelete({ titles, resolve }));
  }, []);
  const resolvePendingDelete = useCallback((ok: boolean) => {
    setPendingDelete((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  const adapter = useMemo<EditorSurfaceAdapter>(
    () => ({
      surface: 'board',
      agentId: AGENT_ID,
      targetId: boardId,
      threadQueryKey: ['boards', boardId, 'chat-thread'],
      resolveThreadId: async () => {
        const result = await getContractsClient().boards.getChatThread({ params: { id: boardId } });
        if (result.status !== 200) {
          throw new Error(`Chat thread lookup failed: ${result.status}`);
        }
        return chatThreadResponseSchema.parse(result.body).threadId;
      },
      getRequestContext: (): ChatRequestContext => ({
        currentBoard: serializeBoardForChat({
          boardId,
          boardTitle: boardTitleRef.current,
          fields: boardStateRef.current.fields,
          rows: boardStateRef.current.rows,
          views: boardStateRef.current.views,
          assignableMembers: membersRef.current,
          ...(groupByFieldIdRef.current ? { groupByFieldId: groupByFieldIdRef.current } : {}),
        }),
      }),
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
          edit_current_board: edit,
        },
      }),
      // Tool-based edit: the loop's edit_document tool plans board ops
      // server-side (generateBoardOperations) and streams them as
      // editor_operations; we apply them to the live Yjs board via the existing
      // client executor (with its delete-confirm dialog). Replaces the old
      // trigger_board_action → /api/boards/:id/ai round-trip.
      registerEditHandler: (ctx) =>
        useChatConfigStore.getState().registerEditorOpsHandler(boardId, async (payload) => {
          if (payload.targetId !== boardId || payload.surface !== 'board') return;
          // The toggle may have been switched off after the request was sent (the
          // classifier read enabledTools at send time). Don't apply, but tell the
          // user so the chat's success-sounding reply isn't mistaken for a real edit.
          if (!ctx.getAiEditEnabled()) {
            toast.info('KI-Bearbeitung ist deaktiviert — es wurde nichts am Board geändert.');
            return;
          }
          // Defence in depth: the wire carries ops as unknown[]; re-validate each
          // against the op schema so one malformed op drops alone.
          const ops = [];
          for (const raw of payload.operations) {
            const parsed = boardOperationSchema.safeParse(raw);
            if (parsed.success) ops.push(parsed.data);
          }
          if (ops.length === 0) {
            toast.info('Es wurde keine Board-Änderung erkannt — nichts wurde geändert.');
            return;
          }
          try {
            const { applied, skipped } = await applyBoardOperations(ops, {
              boardState: boardStateRef.current,
              currentUserId: userId ?? '',
              assignableMembers: membersRef.current,
              ...(groupByFieldIdRef.current ? { groupByFieldId: groupByFieldIdRef.current } : {}),
              addComment: async (taskId, text) => {
                const res = await getContractsClient().boardComments.createComment({
                  params: { boardId, cardId: taskId },
                  body: { blocks: [{ type: 'text', text }] },
                });
                if (res.status !== 201) throw new Error(`Kommentar fehlgeschlagen (${res.status})`);
                void queryClient.invalidateQueries({
                  queryKey: ['board-comments', boardId, taskId],
                });
              },
              confirmDelete,
            });
            if (applied > 0) {
              toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
            }
            if (skipped.length > 0) {
              toast.warning(skipped.join(' · '));
            }
          } catch (err) {
            toast.error(
              `Board-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
            );
          }
        }),
    }),
    [boardId, userId, queryClient, confirmDelete]
  );

  return (
    <>
      <EditorAssistantProvider
        adapter={adapter}
        userId={userId}
        userName={userName}
        aiEditEnabled={aiEditEnabled}
        toggleAiEdit={toggleAiEdit}
      >
        {children}
      </EditorAssistantProvider>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) resolvePendingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete && pendingDelete.titles.length === 1
                ? 'Aufgabe löschen?'
                : `${pendingDelete?.titles.length ?? 0} Aufgaben löschen?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.titles.length <= 5
                ? pendingDelete.titles.map((t) => `„${t}"`).join(', ')
                : 'Diese Aktion kann nicht rückgängig gemacht werden.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolvePendingDelete(false)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolvePendingDelete(true)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
