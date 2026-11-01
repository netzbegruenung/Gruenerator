// The "Gearbeitet für 1 Min. 40 Sek. · 6 Schritte" row a finished turn keeps.
//
// Platform-neutral (zero react/DOM imports) so web and mobile decide the same
// way, like statusLineView / narrationView.
//
// Why a turn needs it at all: retrieval steps draw no card (they live in the
// status line, see toolStatusLine.ts), and the status line retires with the
// stream. A research turn with eight searches therefore left nothing behind but
// its answer. This row is that trace — but only for turns that actually worked;
// a quick answer with one search keeps the clean look.
//
// Decided by what the TURN did, not by which tool ran: a web search can be a
// 2-second lookup or one step in a three-minute loop, and an artifact tool
// already keeps its card.

import { getToolQuery } from './toolResults';
import { searchStatusLabel, type StatusPartLike } from './toolStatusLine';

/**
 * A single step never gets the row: an ordinary agentic lookup is one web
 * search and already takes ~20 s (measured 30.10.2026: 20,3 s), and a heavy
 * single step (Deep Research, an artifact) keeps its own card anyway.
 */
export const RUN_ACTIVITY_MIN_STEPS = 2;
/** From two steps on, a turn that ran at least this long keeps its trace… */
export const RUN_ACTIVITY_MIN_DURATION_MS = 30_000;
/** …and so does one with at least this many steps, however fast. */
export const RUN_ACTIVITY_MANY_STEPS = 3;

/**
 * Loaders that only switch a tool group on. They are plumbing, not work the
 * person would recognise — counting them would turn "2 Schritte" into 3.
 */
const PLUMBING_TOOLS: ReadonlySet<string> = new Set([
  'meine_inhalte_laden',
  'website_werkzeug_laden',
  'parlament_werkzeuge_laden',
]);

export interface RunActivityStep {
  /** The tool-call id — stable across stream and reload. */
  readonly id: string;
  /** `Websuche „Klimageld"`, or the bare tool label without a query. */
  readonly label: string;
}

export interface RunActivityView {
  /** The collapsed row: `Gearbeitet für 1 Min. 40 Sek. · 6 Schritte`. */
  readonly label: string;
  readonly steps: ReadonlyArray<RunActivityStep>;
}

/** `45 Sek.`, `1 Min. 40 Sek.`, `3 Min.` — whole seconds, no hours (a turn is capped well below). */
export function formatRunDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} Sek.`;
  return seconds === 0 ? `${minutes} Min.` : `${minutes} Min. ${seconds} Sek.`;
}

/**
 * The row for a finished turn, or null when it gets none: still running, a
 * single step or none (nothing worth tracing), or few steps done quickly.
 *
 * `durationMs` is null on turns persisted before the duration was recorded;
 * those still get the row by step count, just without the time.
 */
export function selectRunActivity(
  parts: ReadonlyArray<StatusPartLike>,
  durationMs: number | null,
  isRunning: boolean
): RunActivityView | null {
  if (isRunning) return null;

  const steps: RunActivityStep[] = [];
  for (const part of parts) {
    if (part.type !== 'tool-call' || !part.toolName || !part.toolCallId) continue;
    if (PLUMBING_TOOLS.has(part.toolName)) continue;
    steps.push({
      id: part.toolCallId,
      label: searchStatusLabel(part.toolName, getToolQuery(part.args, part.toolName)),
    });
  }

  if (steps.length < RUN_ACTIVITY_MIN_STEPS) return null;
  const long = durationMs != null && durationMs >= RUN_ACTIVITY_MIN_DURATION_MS;
  if (!long && steps.length < RUN_ACTIVITY_MANY_STEPS) return null;

  const count = `${steps.length} Schritte`;
  const label =
    durationMs != null ? `Gearbeitet für ${formatRunDuration(durationMs)} · ${count}` : count;
  return { label, steps };
}
