import { useRecurringTasks as useRecurringTasksQuery } from '@gruenerator/shared/grueneratoren';

import { useOptimizedAuth } from '../../hooks/useAuth';

// The hooks live in `@gruenerator/shared/grueneratoren` (shared with mobile);
// only the list query needs web's auth gate.
export {
  fetchRecurringTaskRuns,
  recurringRunsKey,
  useCreateRecurringTask,
  useDeleteRecurringTask,
  useRecurringTaskRuns,
  useRunRecurringTaskNow,
  useUpdateRecurringTask,
  type RecurringTaskInput,
  type RecurringTaskPatch,
} from '@gruenerator/shared/grueneratoren';

export function useRecurringTasks() {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  return useRecurringTasksQuery(!!user?.id && isAuthenticated && !authLoading);
}
