/**
 * Der Teil der Modell-Gesundheit, der einen Neustart überlebt.
 *
 * `modelHealth` urteilt im Speicher und weiss nach einem Deploy nichts mehr.
 * Diese Datei schreibt alle fünf Minuten eine Zeile je Provider/Modell und
 * liest beim Boot zurück, was das Modell normalerweise leistet — damit der
 * erste Aufruf nach einem Deploy schon beurteilt werden kann.
 *
 * Schreibpfad wie in services/usage/UsageTrackingService.ts: kein `await` im
 * Anfragepfad, ein Timer mit `unref`, Fehler werden geloggt und nicht geworfen.
 */

import cluster from 'node:cluster';

import { gte, sql } from 'drizzle-orm';

import { aiModelLatency } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

import { modelHealthSnapshot, primeBaseline } from './modelHealth.js';

const log = createLogger('modelLatency');

const BUCKET_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Für die Basislinie zählt, was das Modell an einem GUTEN Tag leistet. */
const BASELINE_PERCENTILE = 0.75;
const BASELINE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

let flushTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;

function workerId(): number {
  return cluster.worker?.id ?? 0;
}

function bucketStart(now: number): Date {
  return new Date(Math.floor(now / BUCKET_MS) * BUCKET_MS);
}

/** Den aktuellen Stand wegschreiben und die Zähler leeren. Wirft nie. */
export async function flushModelLatency(): Promise<void> {
  const rows = modelHealthSnapshot({ drain: true });
  if (rows.length === 0) return;

  const bucket = bucketStart(Date.now());
  const worker = workerId();

  try {
    const db = getDrizzleInstance();
    await db
      .insert(aiModelLatency)
      .values(
        rows.map((row) => ({
          bucketStart: bucket,
          provider: row.provider,
          model: row.model,
          worker,
          samples: row.samples,
          slowVerdicts: row.slowVerdicts,
          p50TokensPerSec: row.p50TokensPerSec,
          p50TtftMs: row.p50TtftMs === null ? null : Math.round(row.p50TtftMs),
        }))
      )
      .onConflictDoUpdate({
        target: [
          aiModelLatency.bucketStart,
          aiModelLatency.provider,
          aiModelLatency.model,
          aiModelLatency.worker,
        ],
        set: {
          samples: sql`${aiModelLatency.samples} + excluded.samples`,
          slowVerdicts: sql`${aiModelLatency.slowVerdicts} + excluded.slow_verdicts`,
          p50TokensPerSec: sql`excluded.p50_tokens_per_sec`,
          p50TtftMs: sql`excluded.p50_ttft_ms`,
        },
      });
  } catch (error) {
    log.warn(`Fenster mit ${rows.length} Einträgen nicht geschrieben:`, error);
  }
}

/**
 * Die Basislinie aus den letzten 24 h vorwärmen.
 *
 * p75 der Fenster-p50 und nicht deren Median: die Basislinie soll sagen, was
 * das Modell KANN. Läge in den 24 h eine Störung, zöge der Median sie nach
 * unten und das Register wäre gegen genau die Wiederholung blind. Zu hoch
 * angesetzt korrigiert sich von selbst — jede gesunde Probe speist die EWMA
 * weiter.
 */
export async function primeModelBaselines(): Promise<void> {
  try {
    const db = getDrizzleInstance();
    const since = new Date(Date.now() - BASELINE_LOOKBACK_MS);
    const rows = await db
      .select({
        provider: aiModelLatency.provider,
        model: aiModelLatency.model,
        rate: sql<number>`percentile_cont(${BASELINE_PERCENTILE}) WITHIN GROUP (ORDER BY ${aiModelLatency.p50TokensPerSec})`,
      })
      .from(aiModelLatency)
      .where(gte(aiModelLatency.bucketStart, since))
      .groupBy(aiModelLatency.provider, aiModelLatency.model);

    let geladen = 0;
    for (const row of rows) {
      if (row.rate == null) continue;
      primeBaseline(row.provider, row.model, Number(row.rate));
      geladen++;
    }
    if (geladen > 0) log.info(`Basislinie für ${geladen} Modelle aus den letzten 24 h geladen`);
  } catch (error) {
    log.warn('Basislinie nicht geladen — das Register lernt von vorn:', error);
  }
}

async function deleteOldRows(): Promise<void> {
  try {
    const db = getDrizzleInstance();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.delete(aiModelLatency).where(sql`${aiModelLatency.bucketStart} < ${cutoff}`);
  } catch (error) {
    log.warn('Aufräumen fehlgeschlagen:', error);
  }
}

/** Im Worker: Fenster schreiben und die Basislinie einmal laden. */
export function startModelLatencyRollup(): void {
  if (flushTimer) return;
  void primeModelBaselines();
  flushTimer = setInterval(() => void flushModelLatency(), BUCKET_MS);
  flushTimer.unref?.();
}

/** Nur im Master: alte Fenster wegräumen. */
export function startModelLatencyCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => void deleteOldRows(), CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

export async function stopModelLatencyRollup(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushModelLatency();
}

process.on('SIGTERM', () => void stopModelLatencyRollup());
process.on('SIGINT', () => void stopModelLatencyRollup());
