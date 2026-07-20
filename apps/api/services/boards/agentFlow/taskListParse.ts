/**
 * Pure task-list prompt + parser for the board agent's card-creation path.
 * Kept dependency-free (no AI/DB imports) so it is trivially unit-testable and
 * safe to import anywhere.
 */

export interface GeneratedTask {
  title: string;
  description?: string;
  dueDate?: string | null;
}

export const MAX_TASKS = 20;

export const TASK_LIST_PROMPT = `Du zerlegst eine Aufgabe in konkrete, umsetzbare To-Dos für ein Kanban-Board.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "tasks": [
    { "title": "Kurzer, actionable Aufgabentitel", "description": "1 Satz Kontext (optional)" }
  ]
}

Regeln:
- 1 bis ${MAX_TASKS} Aufgaben, je nach Umfang der Anfrage (auch eine einzelne Aufgabe ist erlaubt)
- Jeder Titel ist klar und handlungsorientiert (beginnt mit einem Verb)
- description ist optional (1 kurzer Satz)
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)
- Kein Markdown, keine Erklärung, NUR das JSON-Objekt`;

/** Parse the model's `{"tasks":[...]}` output tolerantly, capped at MAX_TASKS. */
export function parseTaskList(content: string): GeneratedTask[] {
  const tryParse = (raw: string): GeneratedTask[] | null => {
    try {
      const parsed = JSON.parse(raw) as { tasks?: unknown };
      if (!Array.isArray(parsed.tasks)) return null;
      const tasks = parsed.tasks
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t) => {
          const title = typeof t.title === 'string' ? t.title.trim() : '';
          const description = typeof t.description === 'string' ? t.description.trim() : undefined;
          const dueDate = typeof t.dueDate === 'string' ? t.dueDate : null;
          return { title, ...(description && { description }), dueDate };
        })
        .filter((t) => t.title.length > 0)
        .slice(0, MAX_TASKS);
      return tasks;
    } catch {
      return null;
    }
  };

  const direct = tryParse(content.trim());
  if (direct) return direct;
  const match = content.match(/\{[\s\S]*\}/);
  return match ? (tryParse(match[0]) ?? []) : [];
}
