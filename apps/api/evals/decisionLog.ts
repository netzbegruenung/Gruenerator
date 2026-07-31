/**
 * Client half of the decision-log seam — reads back what a dev backend wrote.
 *
 * The backend writes one JSON file per turn to CHAT_DECISION_LOG_DIR, named by
 * the `x-decision-log-id` header this runner sends (see utils/decisionLog.ts).
 * Here we read it back and hand it to the shared `renderDecisionMap`, so the
 * live lane produces the same artefact the simulated lane commits — with the
 * opposite caveat, which the renderer prints into the file.
 *
 * The wait loop is not paranoia. The backend writes on `res.on('close')`, and
 * the client's `res.text()` resolves when the body ends — two events in two
 * processes with no ordering guarantee between them. Without the poll the file
 * is missing perhaps one turn in twenty, which would read as "no decisions
 * recorded" and quietly understate the map.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type DecisionEntry, type DecisionJournal } from '../utils/decisionJournal.js';

const POLL_INTERVAL_MS = 20;
const POLL_TIMEOUT_MS = 750;

interface RawDecisionLogFile {
  entries?: DecisionEntry[];
  overflowed?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the journal for one turn, waiting briefly for the backend to flush it.
 *
 * Returns null rather than throwing: a missing file means the backend was
 * started without CHAT_DECISION_LOG_DIR, which is the normal case for every
 * remote target. A live run must not fail because a diagnostic is absent.
 */
export async function readDecisionJournal(
  dir: string,
  logId: string
): Promise<DecisionJournal | null> {
  const file = join(dir, `${logId}.json`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (!existsSync(file)) {
    if (Date.now() >= deadline) return null;
    await sleep(POLL_INTERVAL_MS);
  }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as RawDecisionLogFile;
    return { entries: parsed.entries ?? [], overflowed: parsed.overflowed === true };
  } catch {
    // A half-written file caught mid-flush. One retry after a beat, then give
    // up — this is a diagnostic, not a result.
    await sleep(POLL_INTERVAL_MS * 2);
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as RawDecisionLogFile;
      return { entries: parsed.entries ?? [], overflowed: parsed.overflowed === true };
    } catch {
      return null;
    }
  }
}

/** Merges the journals of a turn and its `/resume` continuation into one. */
export function mergeJournals(parts: (DecisionJournal | null)[]): DecisionJournal {
  const present = parts.filter((p): p is DecisionJournal => p !== null);
  let seq = 0;
  return {
    entries: present.flatMap((p) => p.entries).map((e) => ({ ...e, seq: seq++ })),
    overflowed: present.some((p) => p.overflowed),
  };
}
