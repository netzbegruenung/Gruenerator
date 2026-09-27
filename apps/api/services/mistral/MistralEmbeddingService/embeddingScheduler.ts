/**
 * Wie viel Einbettung dieser Prozess gleichzeitig laufen lässt — für alle
 * Aufrufer zusammen.
 *
 * Vorher war die Grenze eine Eigenschaft des *Aufrufs*: jedes
 * `generateBatchEmbeddings` baute sein eigenes `parallelLimit(tasks, 3)`. Zwei
 * gleichzeitige Uploads ergaben also 6 offene Mistral-Anfragen, N Uploads 3N,
 * und keine Stelle im Prozess konnte beantworten, wie viel gerade läuft. Am
 * 17.08.2026 hing daran ein Chat-Turn hinter einem 697-Batch-Job fest, während
 * ein zweiter Job derselben Datei danebenlief.
 *
 * Zwei Ränge, und der Unterschied ist der eigentliche Zweck:
 *
 * - `interactive` — eine Suchanfrage wartet in Echtzeit auf ihren Vektor.
 * - `bulk` — Indizierung im Hintergrund; ob sie 20 s später fertig wird,
 *   bemerkt niemand.
 *
 * `interactive` wird zuerst bedient. Dass `bulk` unter Dauerlast theoretisch
 * verhungern kann, ist die beabsichtigte Richtung: eine Suchanfrage darf nicht
 * hinter siebenhundert Hintergrund-Batches in der Schlange stehen. Praktisch
 * kann sie es nicht, weil eine Query-Einbettung ein einzelner Aufruf von
 * ~200 ms ist.
 *
 * Der Zustand liegt im Modul, also pro Worker (`WORKER_COUNT` steht auf 2) —
 * dieselbe bewusste Wahl wie bei den Breakern in `services/search/`.
 */

import { env } from '../../../config/env.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('EmbeddingScheduler');

export type EmbeddingPriority = 'interactive' | 'bulk';

const MAX_ACTIVE = Math.max(1, env.MISTRAL_EMBEDDING_CONCURRENCY);

/** Ab dieser Schlangenlänge ist die Sättigung ein Befund und kein Rauschen. */
const QUEUE_WARN_AT = 64;
/** Damit ein einzelner großer Job nicht im Sekundentakt dieselbe Warnung schreibt. */
const QUEUE_WARN_EVERY_MS = 30_000;

let active = 0;
let lastWarnAt = 0;
let peakQueued = 0;

const queues: Record<EmbeddingPriority, Array<() => void>> = {
  interactive: [],
  bulk: [],
};

function queuedCount(): number {
  return queues.interactive.length + queues.bulk.length;
}

function warnIfSaturated(): void {
  const queued = queuedCount();
  if (queued > peakQueued) peakQueued = queued;
  if (queued < QUEUE_WARN_AT) return;

  const now = Date.now();
  if (now - lastWarnAt < QUEUE_WARN_EVERY_MS) return;
  lastWarnAt = now;
  log.warn(
    `${queued} Einbettungen warten (${active}/${MAX_ACTIVE} laufen, davon ${queues.interactive.length} interaktiv) — ` +
      `ein Massenjob hält die Leitung. Ohne diese Zeile sieht der Log nur langsame Batches.`
  );
}

/**
 * Einen frei gewordenen Platz weitergeben. `grant()` löst nur ein Promise auf;
 * die Fortsetzung läuft erst im nächsten Microtask. Deshalb wird `active`
 * VOR dem Aufruf erhöht, sonst würde die Schleife mehr Plätze vergeben als es
 * gibt.
 */
function dispatch(): void {
  while (active < MAX_ACTIVE) {
    const grant = queues.interactive.shift() ?? queues.bulk.shift();
    if (!grant) return;
    active++;
    grant();
  }
}

function acquire(priority: EmbeddingPriority): Promise<void> {
  // Auch bei freiem Platz erst anstellen, wenn schon jemand wartet — sonst
  // überholt ein frisch eintreffender Aufruf die Schlange.
  if (active < MAX_ACTIVE && queuedCount() === 0) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queues[priority].push(resolve);
    warnIfSaturated();
  });
}

/**
 * Eine Einbettungs-Anfrage unter der prozessweiten Grenze ausführen.
 *
 * NICHT verschachteln: wer schon einen Platz hält und hier erneut eintritt,
 * wartet auf einen Platz, den er selbst blockiert. Deshalb greift der Scheduler
 * nur an den beiden Außenkanten (`generateEmbedding`, ein Batch in
 * `generateBatchEmbeddings`); alles darunter läuft ungeplant weiter.
 */
export async function scheduleEmbedding<T>(
  priority: EmbeddingPriority,
  run: () => Promise<T>
): Promise<T> {
  await acquire(priority);
  try {
    return await run();
  } finally {
    active--;
    dispatch();
  }
}

export interface EmbeddingSchedulerStats {
  active: number;
  queued: number;
  queuedInteractive: number;
  peakQueued: number;
  maxActive: number;
}

/** Momentaufnahme für Diagnose und Tests. */
export function embeddingSchedulerStats(): EmbeddingSchedulerStats {
  return {
    active,
    queued: queuedCount(),
    queuedInteractive: queues.interactive.length,
    peakQueued,
    maxActive: MAX_ACTIVE,
  };
}

export function _resetEmbeddingSchedulerForTests(): void {
  active = 0;
  lastWarnAt = 0;
  peakQueued = 0;
  queues.interactive.length = 0;
  queues.bulk.length = 0;
}
