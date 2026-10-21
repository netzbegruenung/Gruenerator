/**
 * The lead's scratch space: the plan and the files.
 *
 * `deepagents` brought both as middleware (`write_todos`, a virtual filesystem
 * in the graph state). Here they are three plain tools over a small object the
 * run owns, because the run needs exactly two things from them: the plan for
 * the sidebar and `/bericht.md` at the end. The other file tools of the old
 * harness (`ls`, `edit_file`, `glob`, `grep`) were never part of the prompt.
 *
 * The whole object is plain JSON so a run can be saved after every step and
 * picked up again after a restart (see runRegistry.ts).
 */

import { tool } from 'ai';
import { z } from 'zod';

export const TODO_STATUSES = ['pending', 'in_progress', 'completed'] as const;

export interface TodoItem {
  content: string;
  status: (typeof TODO_STATUSES)[number];
}

export interface WorkspaceState {
  todos: TodoItem[];
  files: Record<string, string>;
}

export function emptyWorkspace(): WorkspaceState {
  return { todos: [], files: {} };
}

/**
 * The three tools, writing into `state` in place.
 *
 * `onPlan` fires only when the plan actually changed — the model re-sends the
 * whole list on every update, and an unchanged list would make the sidebar
 * flicker.
 */
export function createWorkspaceTools(state: WorkspaceState, onPlan: (todos: TodoItem[]) => void) {
  let planKey = state.todos.map((t) => `${t.content}:${t.status}`).join('|');

  return {
    write_todos: tool({
      description:
        'Legt den Plan an oder aktualisiert ihn: die vollständige Liste der Teilfragen mit ihrem Status. Sende immer die ganze Liste, nicht nur die geänderten Einträge.',
      inputSchema: z.object({
        todos: z.array(
          z.object({
            content: z.string().describe('Die Teilfrage'),
            status: z.enum(TODO_STATUSES),
          })
        ),
      }),
      execute: async ({ todos }): Promise<string> => {
        state.todos = todos;
        const key = todos.map((t) => `${t.content}:${t.status}`).join('|');
        if (key !== planKey) {
          planKey = key;
          onPlan(todos);
        }
        return `Plan gespeichert (${todos.length} Teilfragen).`;
      },
    }),
    write_file: tool({
      description: 'Schreibt eine Datei. Eine vorhandene Datei unter demselben Pfad wird ersetzt.',
      inputSchema: z.object({
        file_path: z.string().describe('Absoluter Pfad, z. B. /bericht.md'),
        content: z.string().describe('Der vollständige Inhalt'),
      }),
      execute: async ({ file_path, content }): Promise<string> => {
        state.files[file_path] = content;
        return `${file_path} gespeichert (${content.length} Zeichen).`;
      },
    }),
    read_file: tool({
      description: 'Liest eine Datei, die du zuvor mit write_file geschrieben hast.',
      inputSchema: z.object({
        file_path: z.string().describe('Absoluter Pfad, z. B. /bericht.md'),
      }),
      execute: async ({ file_path }): Promise<string> =>
        state.files[file_path] ?? `Unter ${file_path} liegt keine Datei.`,
    }),
  };
}
