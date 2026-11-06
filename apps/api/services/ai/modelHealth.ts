/**
 * Welches Modell gerade zäh antwortet — und wie lange wir uns das merken.
 *
 * Am 14.08.2026 antwortete das damalige Primär-Modell (`gemma4-31b`) mit 3,7 tok/s statt der bis
 * dahin notierten ~76. Keine Sicherung schlug an: das Modell war nie STILL, es
 * rann. Die Fristen im Repo (`createIdleDeadline`, die Zeitsperren in
 * die Fassade) messen alle Schweigen, und die Fallback-Kette in `generate.ts`
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
 * 4. **Lange Prompts sind auch keine.** Die Rate teilt durch die Wandzeit, und
 *    die enthält das Prefill. Am 28.10.2026 kam ein Bundestag-Lesefenster mit
 *    ~60k Prompt-Tokens auf 5,9 statt ~31 tok/s — das Modell war gesund, nur
 *    der Prompt lang — und `modelSiblings` leitete fünf Minuten lang JEDE
 *    Gemma-Lane um, den Chat eingeschlossen. Ab LONG_PROMPT_TOKENS wird eine
 *    Probe deshalb nur gezählt. Die Dekodier-Rate ohne Zeit bis zum ersten
 *    Token wäre die genauere Messung, aber der Nicht-Stream-Pfad kennt diese
 *    Zeit nicht, und zwei Einheiten in einer Basislinie wären schlimmer.
 *
 * ── Wie lange gemerkt wird ──
 *
 * Ein AUSDRÜCKLICHES Verdikt (`recordSlowVerdict`: Stillstand vor dem ersten
 * Token, leere Antwort, Ausfall, verlorener Hedge) öffnet das Fenster sofort.
 * Bis 06.11.2026 brauchte es zwei, und jede gesunde Probe dazwischen setzte den
 * Zähler zurück — im Log zu #5399 stand 13 s nach dem Planer-Stillstand auf
 * `melious/gemma-4-31b:balanced` „Success after 1 failures, resetting circuit".
 * Bei einer Störung, die mal 2 s und mal 60 s braucht, öffnete das Fenster so
 * nie, und jeder Zug zahlte die Frist neu. Eine zähe DURCHSATZ-Probe braucht
 * weiter zwei in Folge: die Rate enthält die Anlaufzeit, eine einzelne ist zu
 * oft ein kurzer Werkzeugaufruf mit ein paar Sekunden TTFT.
 *
 * Das Fenster wächst, solange die Störung anhält: 2 → 4 → 8 → 16 → 30 min.
 * Läuft es ab, ist der nächste echte Aufruf die Probe — ein Verdikt öffnet
 * sofort wieder, eine Stufe länger; eine gesunde Probe schliesst. Erst 30 min
 * nach dem Ende des letzten Fensters ohne neues Verdikt fängt die Treppe wieder
 * bei 2 min an. So kostet ein einzelner Ausreisser nur zwei Minuten auf der
 * Ausweich-Lane, und eine stundenlange Störung trifft nur alle halbe Stunde
 * einen Zug.
 *
 * Bewusst kein Hintergrund-Ping als Probe: ein Mini-Prompt besteht sie, während
 * echte, lange Anfragen weiter hängen. Die Probe ist echter Verkehr, und ein
 * Fehlschlag kostet einmal die kurze Frist des Aufrufers.
 *
 * Ein offenes Fenster schliesst NUR über den Ablauf. Gesunde Proben aus
 * Anfragen, die schon vor dem Verdikt liefen, speisen die Basislinie, aber
 * sie heben den Vermerk nicht auf; Verdikte aus solchen Anfragen verlängern
 * ihn auch nicht.
 *
 * Zustand liegt im Speicher, pro Worker (WORKER_COUNT steht auf 2) — dieselbe
 * bewusste Wahl wie bei den Breakern in `services/search/`. Eine Störung kostet
 * damit höchstens einen Zug pro Worker, bevor beide ausweichen.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('modelHealth');

/** Ab wann eine Probe überhaupt etwas über den Durchsatz aussagt. */
const MIN_OUTPUT_TOKENS = 16;

/** Ab dieser Prompt-Länge misst die Wandzeit vor allem das Prefill (Punkt 4 oben). */
const LONG_PROMPT_TOKENS = 30_000;

/**
 * Dasselbe unterhalb der Schwelle: ein Prompt mit dem 50-Fachen der Ausgabe
 * misst ebenfalls vor allem das Prefill. Gemessen 28.10.2026: Bundestag-
 * Lesefenster lagen bei 99–283×, Chat-Antworten meist bei 10–50×; ein
 * 28k-Fenster mit 282 Ausgabe-Tokens fiel unter Last auf 9 tok/s und schaltete
 * die Gemma-Lanes um.
 */
const PREFILL_DOMINATED_RATIO = 50;

/** Wie weit unter die Basislinie eine Probe fallen muss, um als zäh zu gelten. */
const SLOW_FACTOR = 3;

/** So viele beurteilbare Proben, bevor die Basislinie ein Urteil trägt. */
const BASELINE_MIN_SAMPLES = 10;

/** Trägheit der Basislinie. Klein, damit ein einzelner Ausreißer sie nicht zieht. */
const BASELINE_ALPHA = 0.1;

/** Ring für die p50, die in `ai_model_latency` landet. */
const ROLLUP_WINDOW = 64;

/** Zähe Durchsatz-Proben in Folge, bevor das Fenster öffnet. */
const SLOW_SAMPLES_TO_OPEN = 2;

/** Das erste Fenster; jedes weitere in derselben Störung ist doppelt so lang. */
const FIRST_WINDOW_MS = 2 * 60 * 1000;

/** Deckel für das Fenster. */
const MAX_WINDOW_MS = 30 * 60 * 1000;

/** So lange nach dem Ende des letzten Fensters ohne Verdikt gilt die Störung als vorbei. */
const FORGET_AFTER_MS = 30 * 60 * 1000;

export interface ModelSampleInput {
  provider: string;
  model: string;
  outputTokens: number;
  durationMs: number;
  /** Nur beim Streamen bekannt; wird gesammelt, aber nicht beurteilt. */
  ttftMs?: number | null;
  /** Prompt-Tokens, soweit bekannt — lange Prompts werden nicht beurteilt. */
  inputTokens?: number | null;
}

interface Entry {
  provider: string;
  model: string;
  baseline: number | null;
  baselineN: number;
  /** Bis wann das Paar übersprungen wird; `null` = nicht vermerkt. */
  openUntil: number | null;
  /** Stufe des NÄCHSTEN Fensters: seine Länge ist FIRST_WINDOW_MS × 2^level. */
  level: number;
  /** Ende des zuletzt geöffneten Fensters — ab hier zählt FORGET_AFTER_MS. */
  lastWindowEnd: number | null;
  /** Zähe Durchsatz-Proben in Folge. */
  slowSamplesInRow: number;
  /** Fenster abgelaufen, noch keine gesunde Probe: jedes Zäh-Signal öffnet sofort. */
  onProbation: boolean;
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
    openUntil: null,
    level: 0,
    lastWindowEnd: null,
    slowSamplesInRow: 0,
    onProbation: false,
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
 * Ist das Fenster offen? Der Ablauf wird hier festgestellt — und genau dort
 * beginnt die Probezeit.
 */
function currentlyOpen(entry: Entry): boolean {
  if (entry.openUntil === null) return false;
  if (Date.now() < entry.openUntil) return true;
  entry.openUntil = null;
  entry.onProbation = true;
  log.info(`[${keyOf(entry.provider, entry.model)}] Fenster abgelaufen — auf Probe`);
  return false;
}

function openWindow(entry: Entry, grund: string): void {
  const now = Date.now();
  if (entry.lastWindowEnd !== null && now - entry.lastWindowEnd > FORGET_AFTER_MS) {
    entry.level = 0;
  }
  const windowMs = Math.min(FIRST_WINDOW_MS * 2 ** entry.level, MAX_WINDOW_MS);
  entry.openUntil = now + windowMs;
  entry.lastWindowEnd = entry.openUntil;
  if (windowMs < MAX_WINDOW_MS) entry.level++;
  entry.onProbation = false;
  entry.slowSamplesInRow = 0;
  log.warn(
    `[${keyOf(entry.provider, entry.model)}] gilt als zäh (${grund}) — wird für ${Math.round(
      windowMs / 60_000
    )} min übersprungen`
  );
}

/** `explicit`: ein Verdikt aus einer gerissenen Frist, keine Durchsatz-Probe. */
function markSlow(entry: Entry, grund: string, explicit: boolean): void {
  entry.slowVerdicts++;
  if (currentlyOpen(entry)) return;
  if (!explicit && !entry.onProbation) {
    entry.slowSamplesInRow++;
    if (entry.slowSamplesInRow < SLOW_SAMPLES_TO_OPEN) return;
  }
  openWindow(entry, grund);
}

function markHealthy(entry: Entry): void {
  entry.slowSamplesInRow = 0;
  if (currentlyOpen(entry)) return;
  if (entry.onProbation) {
    entry.onProbation = false;
    log.info(`[${keyOf(entry.provider, entry.model)}] Probe bestanden`);
  }
}

/** Eine abgeschlossene Modellantwort melden. Beurteilt und zählt. */
export function recordModelSample(sample: ModelSampleInput): void {
  const entry = entryFor(sample.provider, sample.model);
  entry.samples++;
  if (sample.ttftMs != null && sample.ttftMs >= 0) push(entry.ttfts, sample.ttftMs);

  if (sample.durationMs <= 0 || sample.outputTokens < MIN_OUTPUT_TOKENS) return;
  if (sample.inputTokens != null && sample.inputTokens >= LONG_PROMPT_TOKENS) return;
  if (
    sample.inputTokens != null &&
    sample.inputTokens > sample.outputTokens * PREFILL_DOMINATED_RATIO
  )
    return;

  const rate = sample.outputTokens / (sample.durationMs / 1000);
  if (!Number.isFinite(rate) || rate <= 0) return;
  push(entry.rates, rate);

  if (entry.baseline === null || entry.baselineN < BASELINE_MIN_SAMPLES) {
    feedBaseline(entry, rate);
    return;
  }

  if (rate < entry.baseline / SLOW_FACTOR) {
    markSlow(entry, `${rate.toFixed(1)} statt ~${entry.baseline.toFixed(0)} tok/s`, false);
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
 * Synth-Stillstand, verlorener Hedge, Ausfall des Anbieters. Fängt das
 * Schweigen, das die Messung nicht sieht, weil gar keine Tokens kamen. Öffnet
 * das Fenster sofort.
 */
export function recordSlowVerdict(provider: string, model: string, grund: string): void {
  markSlow(entryFor(provider, model), grund, true);
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
 * der Vermerk überdauern das.
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
