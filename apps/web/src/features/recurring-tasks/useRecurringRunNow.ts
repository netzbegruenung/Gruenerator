/**
 * „Jetzt ausführen" mit Rückmeldung.
 *
 * Der Aufruf war Feuer und Vergessen: 202, Liste neu laden, fertig. `isPending`
 * deckte die Millisekunden der HTTP-Antwort, während der Lauf selbst Minuten
 * dauert — für die Person sah ein laufender Agent aus wie ein toter Knopf.
 *
 * **Warum IDs und keine Zeitstempel:** ob ein Lauf „neu" ist, lässt sich nicht
 * an `createdAt > startedAt` entscheiden. `createdAt` kommt vom Server, der
 * Startzeitpunkt aus dem Browser; geht eine der beiden Uhren vor, gilt entweder
 * der frische Lauf als alt (der Knopf hängt bis zum Zeitablauf) oder ein alter
 * als frisch (die Meldung zeigt ein Ergebnis von gestern). Verglichen wird
 * deshalb gegen die Menge der VOR dem Start bekannten Lauf-IDs — dafür wird
 * diese Menge vor dem Start einmal frisch geholt, statt dem Cache zu trauen,
 * der leer ist, solange niemand den Verlauf aufgeklappt hat.
 */
import { type RecurringTaskDelivery, type RecurringTaskRun } from '@gruenerator/contracts';
import { toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchRecurringTaskRuns,
  recurringRunsKey,
  useRecurringTaskRuns,
  useRunRecurringTaskNow,
} from './api';

const POLL_INTERVAL_MS = 5000;
/** Danach hört der Knopf auf zu warten — die Benachrichtigung trägt das Ergebnis. */
const AWAIT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Endzustände. `running` gehört NICHT dazu: seit die Lauf-Zeile beim Claim
 * entsteht, legt der Klick selbst eine an, die der Grundmenge fehlt — „unbekannte
 * ID" allein würde also sofort auf den eigenen, gerade gestarteten Lauf passen
 * und Sekunden nach dem Klick „Ergebnis fertig" melden.
 */
const TERMINAL: ReadonlySet<RecurringTaskRun['status']> = new Set(['completed', 'empty', 'failed']);

/** Exportiert, weil hier die eigentliche Entscheidung sitzt (siehe Kopf). */
export function pickFreshRun(
  runs: readonly RecurringTaskRun[] | undefined,
  knownIds: ReadonlySet<string>
): RecurringTaskRun | null {
  return (runs ?? []).find((r) => !knownIds.has(r.id) && TERMINAL.has(r.status)) ?? null;
}

export interface RunNowTask {
  id: string;
  title: string;
  delivery: RecurringTaskDelivery;
}

function announce(run: RecurringTaskRun, task: RunNowTask, go: (url: string) => void): void {
  if (run.status === 'empty') {
    toast('Der Lauf hat nichts Neues ergeben.');
    return;
  }
  if (run.status === 'failed') {
    toast.error(`Lauf fehlgeschlagen: ${task.title}`);
    return;
  }
  const label = task.delivery === 'thread' ? 'Chat öffnen' : 'Öffnen';
  // In eine Konstante ziehen: TypeScript verengt eine Eigenschaft nicht in die
  // Closure hinein, ein Cast wäre hier nur Lärm.
  const url = run.resultUrl;
  toast.success(
    `Ergebnis fertig: ${task.title}`,
    url != null ? { action: { label, onClick: () => go(url) } } : undefined
  );
}

export function useRecurringRunNow(task: RunNowTask, onOpenResult?: (url: string) => void) {
  const runNow = useRunRecurringTaskNow();
  const qc = useQueryClient();
  const [awaiting, setAwaiting] = useState(false);
  const knownIds = useRef<ReadonlySet<string>>(new Set());

  const { data: runs } = useRecurringTaskRuns(
    awaiting ? task.id : undefined,
    awaiting ? POLL_INTERVAL_MS : undefined
  );

  const go = useCallback(
    (url: string) => {
      if (onOpenResult) onOpenResult(url);
      else if (typeof window !== 'undefined') window.location.assign(url);
    },
    [onOpenResult]
  );

  useEffect(() => {
    if (!awaiting) return;
    const fresh = pickFreshRun(runs, knownIds.current);
    if (!fresh) return;
    setAwaiting(false);
    announce(fresh, task, go);
  }, [awaiting, runs, task, go]);

  useEffect(() => {
    if (!awaiting) return;
    const timer = setTimeout(() => {
      setAwaiting(false);
      toast('Der Lauf dauert länger — du bekommst eine Benachrichtigung, sobald er fertig ist.');
    }, AWAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaiting]);

  const start = useCallback(() => {
    if (awaiting || runNow.isPending) return;
    void (async () => {
      try {
        const before = await qc.fetchQuery({
          queryKey: recurringRunsKey(task.id),
          queryFn: () => fetchRecurringTaskRuns(task.id),
        });
        knownIds.current = new Set(before.map((r) => r.id));
      } catch {
        // Verlauf nicht lesbar: lieber ohne Grundmenge warten (der Zeitablauf
        // fängt es ab) als den Start zu verweigern.
        knownIds.current = new Set();
      }
      runNow.mutate(task.id, {
        onSuccess: () => {
          setAwaiting(true);
          toast.success('Lauf gestartet — das Ergebnis kommt in wenigen Minuten.');
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : 'Ausführen fehlgeschlagen.'),
      });
    })();
  }, [awaiting, qc, runNow, task.id]);

  return {
    start,
    /** Deckt HTTP-Aufruf UND Lauf — das ist die Zeit, die der Knopf belegt bleibt. */
    isBusy: awaiting || runNow.isPending,
  };
}
