/**
 * EXPERIMENTAL — TanStack Query hooks for recurring agent tasks. Mirrors
 * features/agents/api.ts: typed getContractsClient().recurringTasks.* with a
 * single query key.
 */
import {
  type CreateRecurringTaskBody,
  type RecurringTask,
  type RecurringTaskRun,
  type UpdateRecurringTaskBody,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useOptimizedAuth } from '../../hooks/useAuth';

export type RecurringTaskInput = CreateRecurringTaskBody;
export type RecurringTaskPatch = UpdateRecurringTaskBody;

const KEY = ['recurring-tasks'] as const;

function readError(body: unknown): string {
  const obj = (body ?? {}) as { message?: unknown };
  return typeof obj.message === 'string' ? obj.message : 'Aktion fehlgeschlagen.';
}

export function useRecurringTasks() {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useQuery({
    queryKey: KEY,
    enabled: !!user?.id && isAuthenticated && !authLoading,
    queryFn: async (): Promise<RecurringTask[]> => {
      const res = await getContractsClient().recurringTasks.list();
      if (res.status === 200) return res.body.tasks;
      throw new Error('Wiederkehrende Aufgaben konnten nicht geladen werden.');
    },
  });
}

export function useRecurringTaskRuns(taskId?: string) {
  return useQuery({
    queryKey: [...KEY, taskId, 'runs'],
    enabled: !!taskId,
    queryFn: async (): Promise<RecurringTaskRun[]> => {
      if (!taskId) return [];
      const res = await getContractsClient().recurringTasks.listRuns({ params: { id: taskId } });
      if (res.status === 200) return res.body.runs;
      throw new Error('Verlauf konnte nicht geladen werden.');
    },
  });
}

export function useCreateRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringTaskInput): Promise<RecurringTask> => {
      const res = await getContractsClient().recurringTasks.create({ body: input });
      if (res.status === 201) return res.body.task;
      throw new Error(readError(res.body));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: RecurringTaskPatch;
    }): Promise<RecurringTask> => {
      const res = await getContractsClient().recurringTasks.update({ params: { id }, body: patch });
      if (res.status === 200) return res.body.task;
      throw new Error(readError(res.body));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await getContractsClient().recurringTasks.remove({ params: { id } });
      if (res.status !== 200) throw new Error('Löschen fehlgeschlagen.');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRunRecurringTaskNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await getContractsClient().recurringTasks.runNow({ params: { id }, body: {} });
      if (res.status !== 202) throw new Error('Ausführen fehlgeschlagen.');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
