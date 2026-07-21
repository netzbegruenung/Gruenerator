/**
 * TanStack Query hook for scheduled / recurring KI-Spalte runs + their run history.
 *
 * CRUD over a board's schedules, plus "run now", the Accept/Redo review actions, and
 * the run-history list (Phase 3). All calls go through the typed contracts client;
 * "run now" and "redo" reuse the shared useTaskPolling loop for status feedback.
 */
import {
  type BoardAgentRunRecord,
  type BoardSchedule,
  type BoardScheduleInput,
  type BoardScheduleUpdate,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useScheduledAgentRuns(boardId: string | undefined, cardId?: string) {
  const queryClient = useQueryClient();
  const schedulesKey = ['board-schedules', boardId];
  const runsKey = ['board-runs', boardId, cardId ?? null];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: schedulesKey });
    void queryClient.invalidateQueries({ queryKey: ['board-runs', boardId] });
  };

  const schedulesQuery = useQuery<BoardSchedule[]>({
    queryKey: schedulesKey,
    enabled: !!boardId,
    queryFn: async () => {
      if (!boardId) return [];
      const res = await getContractsClient().boardSchedules.listSchedules({ params: { boardId } });
      if (res.status !== 200) throw new Error('Zeitpläne konnten nicht geladen werden');
      return res.body;
    },
  });

  const runsQuery = useQuery<BoardAgentRunRecord[]>({
    queryKey: runsKey,
    enabled: !!boardId,
    queryFn: async () => {
      if (!boardId) return [];
      const res = await getContractsClient().boardSchedules.listRuns({
        params: { boardId },
        query: cardId ? { cardId } : {},
      });
      if (res.status !== 200) throw new Error('Läufe konnten nicht geladen werden');
      return res.body;
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (input: { cardId: string; schedule: BoardScheduleInput }) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.createSchedule({
        params: { boardId, cardId: input.cardId },
        body: input.schedule,
      });
      if (res.status !== 201) throw new Error('Zeitplan konnte nicht erstellt werden');
      return res.body;
    },
    onSuccess: () => {
      toast.success('Zeitplan gespeichert.');
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern.'),
  });

  const updateSchedule = useMutation({
    mutationFn: async (input: { scheduleId: string; patch: BoardScheduleUpdate }) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.updateSchedule({
        params: { boardId, scheduleId: input.scheduleId },
        body: input.patch,
      });
      if (res.status !== 200) throw new Error('Zeitplan konnte nicht geändert werden');
      return res.body;
    },
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Fehler beim Ändern.'),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.deleteSchedule({
        params: { boardId, scheduleId },
        body: {},
      });
      if (res.status !== 200) throw new Error('Zeitplan konnte nicht gelöscht werden');
    },
    onSuccess: () => {
      toast.success('Zeitplan gelöscht.');
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Fehler beim Löschen.'),
  });

  const runNow = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.runScheduleNow({
        params: { boardId, scheduleId },
        body: {},
      });
      if (res.status !== 202) throw new Error('Lauf konnte nicht gestartet werden');
      return res.body;
    },
    onSuccess: () => {
      toast.success('Lauf gestartet. Das Ergebnis erscheint gleich auf der Karte.');
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Fehler beim Start.'),
  });

  const acceptRun = useMutation({
    mutationFn: async (taskId: string) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.acceptRun({
        params: { boardId, taskId },
        body: {},
      });
      if (res.status !== 200) throw new Error('Lauf konnte nicht bestätigt werden');
    },
    onSuccess: () => {
      toast.success('Lauf freigegeben.');
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Fehler bei der Freigabe.'),
  });

  const redoRun = useMutation({
    mutationFn: async (input: { taskId: string; instruction?: string }) => {
      if (!boardId) throw new Error('boardId fehlt');
      const res = await getContractsClient().boardSchedules.redoRun({
        params: { boardId, taskId: input.taskId },
        body: input.instruction ? { instruction: input.instruction } : {},
      });
      if (res.status !== 202) throw new Error('Lauf konnte nicht wiederholt werden');
      return res.body;
    },
    onSuccess: () => {
      toast.success('Neuer Lauf gestartet.');
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Fehler beim Wiederholen.'),
  });

  return {
    schedulesQuery,
    runsQuery,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runNow,
    acceptRun,
    redoRun,
  };
}
