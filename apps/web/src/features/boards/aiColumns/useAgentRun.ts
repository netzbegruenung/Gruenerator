/**
 * Mutation hook for "Grünerator-Agent starten". Enqueues the flow task, then polls
 * its status for completion feedback via the shared useTaskPolling loop. The
 * generated document is linked into the card and shared with the board's members
 * server-side (Hocuspocus internal API, see apps/api boardLinkService /
 * boardSharingService), so the link survives even if this tab is closed.
 * `isRunning` debounces the button and stays true through the poll.
 */
import {
  type BoardAgentRunStatusResponse,
  type BoardAiTask,
  type BoardFlowCardContext,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { useCallback } from 'react';

import { useTaskPolling } from '../hooks/useTaskPolling';

export function useAgentRun(boardId: string | undefined) {
  const { isRunning, runWithPolling } = useTaskPolling<BoardAgentRunStatusResponse>();

  const run = useCallback(
    async (cardId: string, flow: BoardAiTask, cardContext: BoardFlowCardContext) => {
      if (!boardId) return;
      const client = getContractsClient();
      await runWithPolling({
        start: async () => {
          try {
            const res = await client.boardAgent.agentRun({
              params: { boardId, cardId },
              body: { flow, cardContext },
            });
            if (res.status !== 202) {
              const body = res.body as { error?: string };
              toast.error(body?.error ?? 'Agent konnte nicht gestartet werden.');
              return null;
            }
            toast.success(
              'Grünerator-Agent gestartet. Das Ergebnis erscheint gleich auf der Karte.'
            );
            return res.body.taskId;
          } catch {
            toast.error('Agent konnte nicht gestartet werden.');
            return null;
          }
        },
        poll: async (taskId) => {
          const statusRes = await client.boardAgent.agentRunStatus({ params: { boardId, taskId } });
          return statusRes.status === 200 ? statusRes.body : null;
        },
        onSettled: (result) => {
          if (result.status === 'failed') {
            toast.error('Die Agent-Aufgabe konnte nicht abgeschlossen werden.');
            return;
          }
          toast.success(
            result.documentId
              ? 'Dokument erstellt und mit der Karte verknüpft.'
              : 'Grünerator-Agent fertig — Ergebnis als Kommentar.'
          );
        },
      });
    },
    [boardId, runWithPolling]
  );

  return { run, isRunning };
}
