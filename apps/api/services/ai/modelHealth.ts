/**
 * Welches Modell gerade zäh antwortet — und wie lange wir uns das merken.
 *
 * Am 14.08.2026 antwortete `regolo/gemma4-31b` mit 3,7 tok/s statt der bis
 * dahin notierten ~76. Keine Sicherung schlug an: das Modell war nie STILL, es
 * rann. Die Fristen im Repo (`createIdleDeadline`, die Zeitsperren in
 * `aiService`) messen alle Schweigen, und die Fallback-Kette in `aiService`
 * feuert nur bei Fehler oder leerem Inhalt. Langsamkeit hatte keinen Detektor.
 *
 * Dieses Register ist der Detektor plus das Gedächtnis dazu. Ohne Gedächtnis
 * zahlt jeder Turn den Preis der Entdeckung neu — der Hedge aus #2661 wartete
 * pro Prüfschritt 75 s ab, obwohl der Turn davor die Störung schon bewiesen
 * hatte.
 *
 * ── Warum relativ und nicht absolut ──
 *
 * „Langsam" ist ein Drittel des EIGENEN Normalwerts, nicht eine Zahl in tok/s.
 * Ein dichtes 31B und ein 4B-MoE haben keine gemeinsame Schwelle; jede absolute
 * Zahl wäre für das eine ein Fehlalarm und für das andere blind. Die Basislinie
 * baut sich aus dem laufenden Verkehr auf und wird beim Boot aus
 * `ai_model_latency` vorgewärmt.
 *
 * ── Drei Dinge, die leicht falsch werden ──
 *
 * 1. **Die Basislinie darf die Störung nicht fressen.** Würde sie auch von
 *    langsamen Proben gespeist, sänke sie mit — „langsam" wäre nach ein paar
 *    Minuten das neue Normal und der Vermerk löschte sich selbst. Sie nimmt
 *    deshalb nur Proben auf, die als gesund beurteilt wurden.
 * 2. **Der Kaltstart hat keine Referenz, und das ist keine Nachlässigkeit.**
 *    Fallen die ersten Proben eines Paares mitten in eine Störung, IST die
 *    Störung die Basislinie — ohne Vorwissen lässt sich „langsam" nicht von
 *    „so ist dieses Modell eben" unterscheiden, und eine absolute Schwelle
 *    wäre genau die Zahl, die es hier nicht geben soll. Zwei Dinge federn das:
 *    `primeBaseline` lädt beim Boot die p75 der letzten 24 h, und sobald die
 *    Störung endet, ziehen die gesunden Proben die EWMA nach oben, bis die
 *    zähen unter ein Drittel fallen. Blind bleibt also nur der Fall „frische
 *    Installation UND laufende Störung", und auch der heilt von selbst.
 * 3. **Kurze Antworten sind keine Durchsatzmessung.** Ein Auflöser mit
 *    `max_tokens: 8` liefert 2 Tokens in 300 ms — das sind 6,7 tok/s und misst
 *    die Anlaufzeit, nicht den Durchsatz. Unter MIN_OUTPUT_TOKENS wird eine
 *    Probe nur für die Statistik gezählt, nie beurteilt.
 *
 * Zustand liegt im Speicher, pro Worker (WORKER_COUNT steht auf 2) — dieselbe
 * bewusste Wahl wie bei den Breakern in `services/search/`.
 */

import { createLogger } from '../../utils/logger.js';
import { CircuitBreaker } from '../search/searchRetryStrategy.js';

const log = createLogger('modelHealth');

/** Ab wann eine Probe überhaupt etwas über den Durchsatz aussagt. */
const MIN_OUTPUT_TOKENS = 16;

/** Wie weit unter die Basislinie eine Probe fallen muss, um als zäh zu gelten. */
const SLOW_FACTOR = 3;

/** So viele beurteilbare Proben, bevor die Basislinie ein Urteil trägt. */
const BASELINE_MIN_SAMPLES = 10;

/** Trägheit der Basislinie. Klein, damit ein einzelner Ausreißer sie nicht zieht. */
const BASELINE_ALPHA = 0.1;

/** Ring für die p50, die in `ai_model_latency` landet. */
const ROLLUP_WINDOW = 64;

export interface ModelSampleInput {
  provider: string;
  model: string;
  outputTokens: number;
  durationMs: number;
  /** Nur beim Streamen bekannt; wird gesammelt, aber nicht beurteilt. */
  ttftMs?: number | null;
}

interface Entry {
  provider: string;
  model: string;
  baseline: number | null;
  baselineN: number;
  breaker: CircuitBreaker;
  /** Nach dem Auto-Reset des Breakers genügt EIN Verdikt zum erneuten Öffnen. */
  onProbation: boolean;
  wasOpen: boolean;
  rates: number[];
  ttfts: number[];
  samples: number;
  slowVerdicts: number;
}

const entries = new Map<string, Entry>();

function keyOf(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function entryFor(provider: string, model: string): Entry {
  const key = keyOf(provider, model);
  const existing = entries.get(key);
  if (existing) return existing;
  const created: Entry = {
    provider,
    model,
    baseline: null,
    baselineN: 0,
    breaker: new CircuitBreaker({ failureThreshold: 2, resetTimeMs: 5 * 60 * 1000, label: key }),
    onProbation: false,
    wasOpen: false,
    rates: [],
    ttfts: [],
    samples: 0,
    slowVerdicts: 0,
  };
  entries.set(key, created);
  return created;
}

function push(ring: number[], value: number): void {
  ring.push(value);
  if (ring.length > ROLLUP_WINDOW) ring.shift();
}

/**
 * `isOpen()` führt den Auto-Reset selbst aus. Der Übergang offen → zu ist
 * deshalb nur zu sehen, wenn man ihn abfragt — und genau dort beginnt die
 * Probezeit.
 */
function currentlyOpen(entry: Entry): boolean {
  const open = entry.breaker.isOpen();
  if (entry.wasOpen && !open) {
    entry.onProbation = true;
    log.info(`[${keyOf(entry.provider, entry.model)}] Fenster abgelaufen — auf Probe`);
  }
  entry.wasOpen = open;
  return open;
}

function markSlow(entry: Entry, grund: string): void {
  const key = keyOf(entry.provider, entry.model);
  entry.slowVerdicts++;
  const warOffen = currentlyOpen(entry);
  entry.breaker.recordFailure();
  if (entry.onProbation) {
    // Auf Probe reicht ein Verdikt. Der Breaker öffnet erst bei zwei — die
    // zweite Meldung ist der Verzicht darauf, das Fenster noch einmal
    // auszusitzen, nicht ein zweiter Befund.
    entry.breaker.recordFailure();
    entry.onProbation = false;
  }
  if (!warOffen && entry.breaker.isOpen()) {
    entry.wasOpen = true;
    log.warn(`[${key}] gilt als zäh (${grund}) — wird für 5 min übersprungen`);
  }
}

function markHealthy(entry: Entry): void {
  if (entry.onProbation) {
    entry.onProbation = false;
    log.info(`[${keyOf(entry.provider, entry.model)}] Probe bestanden`);
  }
  entry.breaker.recordSuccess();
  entry.wasOpen = false;
}

/** Eine abgeschlossene Modellantwort melden. Beurteilt und zählt. */
export function recordModelSample(sample: ModelSampleInput): void {
  const entry = entryFor(sample.provider, sample.model);
  entry.samples++;
  if (sample.ttftMs != null && sample.ttftMs >= 0) push(entry.ttfts, sample.ttftMs);

  if (sample.durationMs <= 0 || sample.outputTokens < MIN_OUTPUT_TOKENS) return;

  const rate = sample.outputTokens / (sample.durationMs / 1000);
  if (!Number.isFinite(rate) || rate <= 0) return;
  push(entry.rates, rate);

  if (entry.baseline === null || entry.baselineN < BASELINE_MIN_SAMPLES) {
    feedBaseline(entry, rate);
    return;
  }

  if (rate < entry.baseline / SLOW_FACTOR) {
    markSlow(entry, `${rate.toFixed(1)} statt ~${entry.baseline.toFixed(0)} tok/s`);
    return;
  }

  markHealthy(entry);
  feedBaseline(entry, rate);
}

function feedBaseline(entry: Entry, rate: number): void {
  entry.baseline =
    entry.baseline === null ? rate : entry.baseline * (1 - BASELINE_ALPHA) + rate * BASELINE_ALPHA;
  entry.baselineN++;
}

/**
 * Ein ausdrückliches Verdikt aus einer gerissenen Frist — First-Token-Timeout,
 * Synth-Stillstand, verlorener Hedge. Fängt das Schweigen, das die Messung
 * nicht sieht, weil gar keine Tokens kamen.
 */
export function recordSlowVerdict(provider: string, model: string, grund: string): void {
  markSlow(entryFor(provider, model), grund);
}

/** Gilt dieses Paar gerade als zäh? */
export function isModelSlow(provider: string, model: string): boolean {
  const entry = entries.get(keyOf(provider, model));
  return entry ? currentlyOpen(entry) : false;
}

/**
 * Die Basislinie beim Boot vorwärmen, damit nach einem Deploy nicht die ersten
 * Aufrufe urteilslos durchlaufen. Überschreibt nichts, was der laufende Betrieb
 * schon gelernt hat.
 */
export function primeBaseline(provider: string, model: string, tokensPerSec: number): void {
  if (!Number.isFinite(tokensPerSec) || tokensPerSec <= 0) return;
  const entry = entryFor(provider, model);
  if (entry.baselineN > 0) return;
  entry.baseline = tokensPerSec;
  entry.baselineN = BASELINE_MIN_SAMPLES;
}

export interface ModelHealthRow {
  provider: string;
  model: string;
  samples: number;
  slowVerdicts: number;
  p50TokensPerSec: number | null;
  p50TtftMs: number | null;
  isSlow: boolean;
  baseline: number | null;
}

function p50(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/**
 * Momentaufnahme für den Rollup und die Tests. `drain` setzt die Zähler
 * zurück, damit ein Fenster nicht doppelt geschrieben wird — die Basislinie und
 * der Breaker überdauern das.
 */
export function modelHealthSnapshot(options: { drain?: boolean } = {}): ModelHealthRow[] {
  const rows: ModelHealthRow[] = [];
  for (const entry of entries.values()) {
    if (entry.samples === 0) continue;
    rows.push({
      provider: entry.provider,
      model: entry.model,
      samples: entry.samples,
      slowVerdicts: entry.slowVerdicts,
      p50TokensPerSec: p50(entry.rates),
      p50TtftMs: p50(entry.ttfts),
      isSlow: currentlyOpen(entry),
      baseline: entry.baseline,
    });
    if (options.drain) {
      entry.samples = 0;
      entry.slowVerdicts = 0;
      entry.rates = [];
      entry.ttfts = [];
    }
  }
  return rows;
}

export function _resetModelHealthForTests(): void {
  entries.clear();
}
