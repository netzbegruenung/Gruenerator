import {
  DECISION_POINTS,
  type DecisionEntry,
  type DecisionInputs,
  type DecisionJournal,
  type DecisionPointId,
} from '../utils/decisionJournal.js';

import { type ChatTrace } from './types.js';

/**
 * Renders one turn's decisions as a fixed-width, registry-ordered block.
 *
 * Hand-rolled rather than a vitest snapshot, for two reasons. The repo has zero
 * snapshot usage today, and introducing it introduces `-u` — one keystroke that
 * blesses a regression; the culture here is the opposite (`assertions.ts` hand-
 * writes every failure string, the eval baseline updates only behind an explicit
 * flag plus a PR). And the requirement is DIFF LEGIBILITY: a serialiser emits an
 * object where a reordered key is a diff, whereas fixed columns in a fixed order
 * mean nothing moves except what actually changed.
 *
 * Three states per point, which is what makes "this guard stopped firing"
 * visible at all:
 *   `= <branch>`     reached, chose this
 *   `= (not reached)` never evaluated on this path — a refactor that routes
 *                     AROUND a gate shows up here and nowhere else
 *   `= (none)`        a repeatable point that fired zero times
 */

const COLUMN = 32;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Points that can legitimately fire more than once in a turn. */
const REPEATABLE: ReadonlySet<DecisionPointId> = new Set(['loop.tool_guard']);

function redact(value: string): string {
  return value.replace(UUID_RE, '<id>');
}

function formatInputs(inputs: DecisionInputs | undefined): string {
  if (!inputs) return '';
  return Object.entries(inputs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) => `${key}=${redact(Array.isArray(value) ? value.join('|') : String(value))}`
    )
    .join(' ');
}

function line(label: string, value: string, detail: string): string {
  const left = `${label.padEnd(COLUMN)} = ${value}`;
  return detail ? `${left.padEnd(COLUMN + 3 + 30)} ${detail}`.trimEnd() : left.trimEnd();
}

function renderPoint(point: DecisionPointId, entries: DecisionEntry[]): string[] {
  const mine = entries.filter((e) => e.point === point);

  if (REPEATABLE.has(point)) {
    if (mine.length === 0) return [line(point, '(none)', '')];
    // Sorted by content, never by `seq`: under concurrent tool calls the
    // insertion order is an await-interleaving artefact, and a snapshot must
    // not encode it.
    const sorted = [...mine].sort((a, b) =>
      `${String(a.inputs?.tool ?? '')}${a.chose}`.localeCompare(
        `${String(b.inputs?.tool ?? '')}${b.chose}`
      )
    );
    return [
      line(point, `${sorted.length} recorded`, ''),
      ...sorted.map((e) => `    · ${e.chose.padEnd(18)} ${formatInputs(e.inputs)}`.trimEnd()),
    ];
  }

  if (mine.length === 0) return [line(point, '(not reached)', '')];
  // A non-repeatable point firing twice is itself a finding — show both rather
  // than silently keeping the last.
  return mine.map((e) => line(point, e.chose, formatInputs(e.inputs)));
}

function renderWire(trace: ChatTrace): string {
  const tools = trace.toolCalls.map((t) => t.toolName).join(',');
  return [
    `intent=${String(trace.intent)}`,
    `agentic=${String(trace.agentic)}`,
    `tools=[${tools}]`,
    `warnings=[${trace.warnings.join(',')}]`,
    `interrupts=${trace.interrupts.length}`,
    `confirmActions=[${trace.confirmActions.join(',')}]`,
    `documentCreated=${String(trace.documentCreated)}`,
    `sharepicGenerated=${String(trace.sharepicGenerated)}`,
    `answerChars=${trace.fullText.length}`,
  ].join(' ');
}

export interface DecisionMapTurn {
  prompt: string;
  journal: DecisionJournal;
  trace: ChatTrace;
}

/**
 * Which lane produced the map. The two carry OPPOSITE caveats and must never
 * be mistaken for one another, so the caveat is printed into the artefact
 * rather than left to whoever files the directory:
 *
 *  - `simulated` is reproducible but the model output is an assumption.
 *  - `live` is real model output but a single unrepeatable sample; the same
 *    prompt can take a different path on the next run, so a diff between two
 *    live maps is evidence to READ, never an assertion to fail on.
 */
export type DecisionMapLane = 'simulated' | 'live';

const LANE_HEADER: Record<DecisionMapLane, string[]> = {
  simulated: [
    '# Simulated decision map. Regenerate with SIM_UPDATE=1.',
    '# A green diff proves the BRANCHES ran as scripted. It proves nothing',
    '# about what a real model would have done.',
  ],
  live: [
    '# LIVE decision map — recorded from a real backend with a real model.',
    '# One sample, not a baseline: the same prompt may classify differently on',
    '# the next run. Read the diff, never assert on it.',
  ],
};

export function renderDecisionMap(
  scenarioId: string,
  category: string,
  turns: DecisionMapTurn[],
  lane: DecisionMapLane = 'simulated'
): string {
  const out: string[] = [`# ${scenarioId} — ${category}`, ...LANE_HEADER[lane]];

  turns.forEach((turn, index) => {
    out.push('', `## turn ${index}: ${JSON.stringify(turn.prompt)}`);
    for (const point of Object.keys(DECISION_POINTS) as DecisionPointId[]) {
      out.push(...renderPoint(point, turn.journal.entries));
    }
    if (turn.journal.overflowed) out.push('!! journal overflowed — entries truncated');
    out.push('-- wire --', renderWire(turn.trace));
  });

  return `${out.join('\n')}\n`;
}
