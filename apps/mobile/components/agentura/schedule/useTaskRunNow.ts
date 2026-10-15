import { type RecurringTaskRun } from '@gruenerator/contracts';
import {
  fetchRecurringTaskRuns,
  recurringRunsKey,
  useRecurringTaskRuns,
  useRunRecurringTaskNow,
} from '@gruenerator/shared/grueneratoren';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5000;
/** Danach hört die Seite auf zu warten — die Benachrichtigung trägt das Ergebnis. */
const AWAIT_TIMEOUT_MS = 10 * 60 * 1000;

/** `running` ist kein Endzustand: der Klick legt selbst sofort eine Lauf-Zeile an. */
const TERMINAL: ReadonlySet<RecurringTaskRun['status']> = new Set(['completed', 'empty', 'failed']);

/**
 * Der erste abgeschlossene Lauf, der VOR dem Start nicht bekannt war. IDs statt
 * Zeitstempel, weil Server- und Geräteuhr auseinanderlaufen können (wie web
 * `useRecurringRunNow`).
 */
export function pickFreshRun(
  runs: readonly RecurringTaskRun[] | undefined,
  knownIds: ReadonlySet<string>
): RecurringTaskRun | null {
  return (runs ?? []).find((r) => !knownIds.has(r.id) && TERMINAL.has(r.status)) ?? null;
}

export type RunNowState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'timeout' }
  | { kind: 'done'; run: RecurringTaskRun };

/**
 * „Jetzt ausführen" mit Rückmeldung plus der Verlauf der Aufgabe. Der Verlauf
 * wird abgefragt, solange auf den eigenen Lauf gewartet wird oder irgendein
 * Lauf noch `running` ist.
 */
export function useTaskRunNow(taskId: string, onFinished: () => void) {
  const qc = useQueryClient();
  const runNow = useRunRecurringTaskNow();
  const [state, setState] = useState<RunNowState>({ kind: 'idle' });
  const knownIds = useRef<ReadonlySet<string>>(new Set());
  const awaiting = state.kind === 'waiting';

  const cached = qc.getQueryData<RecurringTaskRun[]>(recurringRunsKey(taskId));
  const anyRunning = (cached ?? []).some((r) => r.status === 'running');
  const runsQ = useRecurringTaskRuns(taskId, awaiting || anyRunning ? POLL_INTERVAL_MS : 0);

  useEffect(() => {
    if (!awaiting) return;
    const fresh = pickFreshRun(runsQ.data, knownIds.current);
    if (!fresh) return;
    setState({ kind: 'done', run: fresh });
    onFinished();
  }, [awaiting, runsQ.data, onFinished]);

  useEffect(() => {
    if (!awaiting) return;
    const timer = setTimeout(() => setState({ kind: 'timeout' }), AWAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaiting]);

  const start = useCallback(async (): Promise<void> => {
    if (awaiting || runNow.isPending) return;
    try {
      const before = await qc.fetchQuery({
        queryKey: recurringRunsKey(taskId),
        queryFn: () => fetchRecurringTaskRuns(taskId),
      });
      knownIds.current = new Set(before.map((r) => r.id));
    } catch {
      // Verlauf nicht lesbar: lieber ohne Grundmenge warten als den Start verweigern.
      knownIds.current = new Set();
    }
    await runNow.mutateAsync(taskId);
    setState({ kind: 'waiting' });
  }, [awaiting, qc, runNow, taskId]);

  return {
    runsQ,
    start,
    state,
    dismiss: () => setState({ kind: 'idle' }),
    isBusy: awaiting || runNow.isPending,
  };
}
