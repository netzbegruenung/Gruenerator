/**
 * Mutation hook for "Grünerator-Agent starten". Enqueues the flow task, then polls
 * its status; once the task completes with a document, it links that document into
 * the card client-side via `onLinkDocument` — so the link goes through the live Yjs
 * session (exactly like a manual "Verknüpfen"), which the server can't do.
 * `isRunning` debounces the button and stays true through the poll.
 */
import { type BoardAiTask, type BoardFlowCardContext } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { useCallback, useState } from 'react';

export interface LinkedDocument {
  id: string;
  title: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80; // ~4 min, covers source fetch + generation

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useAgentRun(
  boardId: string | undefined,
  onLinkDocument?: (doc: LinkedDocument) => void
) {
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback(
    async (cardId: string, flow: BoardAiTask, cardContext: BoardFlowCardContext) => {
      if (!boardId || isRunning) return;
      setIsRunning(true);
      try {
        const client = getContractsClient();
        const res = await client.boardAgent.agentRun({
          params: { boardId, cardId },
          body: { flow, cardContext },
        });
        if (res.status !== 202) {
          const body = res.body as { error?: string };
          toast.error(body?.error ?? 'Agent konnte nicht gestartet werden.');
          return;
        }
        toast.success('Grünerator-Agent gestartet. Das Ergebnis erscheint gleich auf der Karte.');

        const { taskId } = res.body;
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
          await delay(POLL_INTERVAL_MS);
          const statusRes = await client.boardAgent.agentRunStatus({
            params: { boardId, taskId },
          });
          if (statusRes.status !== 200) continue;
          const result = statusRes.body;
          if (result.status === 'completed') {
            if (result.documentId && onLinkDocument) {
              onLinkDocument({ id: result.documentId, title: result.documentTitle ?? 'Dokument' });
              toast.success('Dokument erstellt und mit der Karte verknüpft.');
            } else {
              toast.success('Grünerator-Agent fertig — Ergebnis als Kommentar.');
            }
            return;
          }
          if (result.status === 'failed') {
            toast.error('Die Agent-Aufgabe konnte nicht abgeschlossen werden.');
            return;
          }
        }
      } catch {
        toast.error('Agent konnte nicht gestartet werden.');
      } finally {
        setIsRunning(false);
      }
    },
    [boardId, isRunning, onLinkDocument]
  );

  return { run, isRunning };
}
