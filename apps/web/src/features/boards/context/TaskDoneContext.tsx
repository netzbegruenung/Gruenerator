import { createContext, useContext } from 'react';

/**
 * Lets the card detail panel check a task off and every layout render done cards
 * without threading a callback through each layout. Null = no done toggle:
 * the board has no done column, or it is read-only (public board).
 */
export interface TaskDoneValue {
  doneStatusId: string;
  setDone: (rowId: string, done: boolean) => void;
}

const TaskDoneContext = createContext<TaskDoneValue | null>(null);

export const TaskDoneProvider = TaskDoneContext.Provider;

export function useTaskDone(): TaskDoneValue | null {
  return useContext(TaskDoneContext);
}
