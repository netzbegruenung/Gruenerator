/**
 * Pure task-list prompt + parser for the board agent's card-creation path.
 * Kept dependency-free (no AI/DB imports) so it is trivially unit-testable and
 * safe to import anywhere.
 */

export interface GeneratedTask {
  title: string;
  description?: string;
  dueDate?: string | null;
  /** Text work the Grünerator can do itself (research, drafting) — not a task for people. */
  byAgent: boolean;
  /** Indices of earlier tasks in the same list this one builds on. Always < own index. */
  dependsOn: number[];
}

export const MAX_TASKS = 20;

export const TASK_LIST_PROMPT = `Du zerlegst eine Aufgabe in konkrete, umsetzbare To-Dos für ein Kanban-Board.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "tasks": [
    { "title": "Kurzer, actionable Aufgabentitel", "description": "1 Satz Kontext (optional)", "byAgent": true, "dependsOn": [] }
  ]
}

Regeln:
- 1 bis ${MAX_TASKS} Aufgaben, je nach Umfang der Anfrage (auch eine einzelne Aufgabe ist erlaubt)
- Jeder Titel ist klar und handlungsorientiert (beginnt mit einem Verb)
- description ist optional (1 kurzer Satz)
- byAgent: true nur für reine Text- und Recherchearbeit, die eine KI allein erledigen kann (recherchieren, entwerfen, formulieren, zusammenfassen); false für alles, was Menschen tun müssen (Termine, Absprachen, Druck, Verteilen, Entscheiden)
- dependsOn: Positionen (ab 0) früherer Aufgaben dieser Liste, auf deren Ergebnis die Aufgabe aufbaut; [] wenn sie für sich steht
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)
- Kein Markdown, keine Erklärung, NUR das JSON-Objekt`;

/** Parse the model's `{"tasks":[...]}` output tolerantly, capped at MAX_TASKS. */
export function parseTaskList(content: string): GeneratedTask[] {
  const tryParse = (raw: string): GeneratedTask[] | null => {
    try {
      const parsed = JSON.parse(raw) as { tasks?: unknown };
      if (!Array.isArray(parsed.tasks)) return null;
      // Dropping an entry shifts every later position, so dependsOn is remapped
      // from the model's positions to the kept list's. keptIndex only knows
      // entries already kept, so a reference forward, to itself or to a dropped
      // entry falls away — the graph stays acyclic by construction.
      const keptIndex = new Map<number, number>();
      const tasks: GeneratedTask[] = [];
      parsed.tasks.forEach((t: unknown, original) => {
        if (!t || typeof t !== 'object' || tasks.length >= MAX_TASKS) return;
        const r = t as Record<string, unknown>;
        const title = typeof r.title === 'string' ? r.title.trim() : '';
        if (!title) return;
        const description = typeof r.description === 'string' ? r.description.trim() : undefined;
        const dueDate = typeof r.dueDate === 'string' ? r.dueDate : null;
        const dependsOn = Array.isArray(r.dependsOn)
          ? [
              ...new Set(
                r.dependsOn
                  .map((d) => (typeof d === 'number' ? keptIndex.get(d) : undefined))
                  .filter((d): d is number => d !== undefined)
              ),
            ]
          : [];
        keptIndex.set(original, tasks.length);
        tasks.push({
          title,
          ...(description && { description }),
          dueDate,
          byAgent: r.byAgent === true,
          dependsOn,
        });
      });
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

/**
 * The tasks the Grünerator works itself (#3549), as positions into `tasks`, with
 * dependsOn remapped onto this subset. An edge to a task left for people falls
 * away rather than blocking forever.
 */
export function agentTaskSubset(
  tasks: GeneratedTask[]
): Array<{ index: number; dependsOn: number[] }> {
  const subsetIndex = new Map<number, number>();
  const subset: Array<{ index: number; dependsOn: number[] }> = [];
  tasks.forEach((t, index) => {
    if (!t.byAgent) return;
    subsetIndex.set(index, subset.length);
    subset.push({
      index,
      dependsOn: t.dependsOn
        .map((d) => subsetIndex.get(d))
        .filter((d): d is number => d !== undefined),
    });
  });
  return subset;
}
