/**
 * Dev-only file sink that carries the decision journal across a process
 * boundary.
 *
 * The simulated lane binds a journal in-process and reads it back from memory
 * (`__integration__/harness/journalCapture.ts`). The live lane cannot: the eval
 * runner talks HTTP to a *separate* backend process, so nothing binds a
 * recorder there and every `recordDecision` is a no-op. The consequence is that
 * the only lane which sees real model behaviour is also the only lane with no
 * visibility into WHY the turn went the way it did — precisely inverted.
 *
 * This closes that gap without putting decision ids on the wire. The response
 * shape is untouched; the journal leaves through the filesystem, keyed by a
 * correlation id the CLIENT chooses (`x-decision-log-id`). Same idea as
 * `EVAL_RECORD_DIR` in runChatEval.ts, which already dumps raw SSE per turn to
 * a directory.
 *
 * The alternative — an extra SSE event — was rejected on purpose: decision ids
 * are F1 (internally frozen, see CLAUDE.md). Emitting them would make them F0,
 * i.e. a wire contract that shipped mobile binaries and external clients could
 * come to depend on, and instrumentation would have become a public API.
 *
 * WRITE PATH ONLY IN DEVELOPMENT. The gate is `NODE_ENV === 'development'`,
 * the same rail the dev auth bypass uses (`authMiddleware.ts`), and it is
 * checked once at construction: with anything else, `decisionLogMiddleware()`
 * returns null and routes.ts mounts nothing at all. There is no code path that
 * writes a file in production, not even with the env var set.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type Request, type RequestHandler, type Response } from 'express';

import { env } from '../config/env.js';

import { createDecisionJournal, runWithDecisionJournal } from './decisionJournal.js';
import { createLogger } from './logger.js';

const log = createLogger('decisionLog');

/** Anything outside this set is replaced — the id names a file path. */
const UNSAFE_IN_FILENAME = /[^A-Za-z0-9._-]+/g;

/**
 * The header is client-controlled, so it is treated as hostile even though the
 * whole feature is dev-gated: `..` and every separator collapse to `_`, and the
 * result is joined onto the configured directory, never used as a path itself.
 */
export function sanitizeLogId(raw: string): string {
  const flat = raw.replace(UNSAFE_IN_FILENAME, '_').replace(/\.{2,}/g, '_');
  const trimmed = flat.replace(/^[._]+/, '').slice(0, 120);
  return trimmed.length > 0 ? trimmed : 'unnamed';
}

/** Shape of one written file. Read back by `apps/api/evals/decisionLogReader.ts`. */
export interface DecisionLogFile {
  id: string;
  method: string;
  path: string;
  /** Wall-clock, for humans reading the directory. Never asserted on. */
  at: string;
  entries: { point: string; chose: string; because?: string; inputs?: unknown; seq: number }[];
  overflowed: boolean;
}

/**
 * The two settings the gate reads. Injectable because `config/env.ts` parses
 * `process.env` exactly once at import time, so `vi.stubEnv` cannot reach it —
 * and the production-safety property here (writes nothing outside development)
 * is precisely the one that has to be asserted rather than asserted-about.
 * Production passes nothing and gets the real env.
 */
export interface DecisionLogEnv {
  readonly NODE_ENV: string;
  readonly CHAT_DECISION_LOG_DIR?: string | undefined;
}

/** The configured sink directory, or null when the sink is off. */
export function decisionLogDir(source: DecisionLogEnv = env): string | null {
  if (source.NODE_ENV !== 'development') return null;
  const dir = source.CHAT_DECISION_LOG_DIR?.trim();
  return dir != null && dir.length > 0 ? dir : null;
}

/**
 * Express middleware binding a journal per request and writing it out when the
 * response closes, or null when the sink is off.
 *
 * `close` rather than `finish`: an SSE stream that the client aborts never
 * finishes, and a turn that died halfway is exactly the one whose decisions you
 * want. `close` fires in both cases, so a `written` latch guards the double.
 */
export function decisionLogMiddleware(source: DecisionLogEnv = env): RequestHandler | null {
  const dir = decisionLogDir(source);
  if (dir === null) return null;

  let sequence = 0;
  log.info('chat decision journal → %s (development only)', dir);

  return (req: Request, res: Response, next): void => {
    const journal = createDecisionJournal();
    const header = req.headers['x-decision-log-id'];
    const id = sanitizeLogId(
      typeof header === 'string' && header.length > 0 ? header : `req-${++sequence}`
    );

    let written = false;
    res.on('close', () => {
      if (written) return;
      written = true;
      const file: DecisionLogFile = {
        id,
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.originalUrl,
        at: new Date().toISOString(),
        entries: journal.entries,
        overflowed: journal.overflowed,
      };
      try {
        // `sanitizeLogId` already collapses every separator and `..`; the
        // containment check is the second lock, and the one static analysis can
        // see (CodeQL js/path-injection).
        const baseDir = path.resolve(dir);
        const target = path.resolve(baseDir, `${id}.json`);
        if (!target.startsWith(baseDir + path.sep)) return;
        mkdirSync(baseDir, { recursive: true });
        writeFileSync(target, JSON.stringify(file, null, 2));
      } catch (error) {
        // A dev diagnostic must never take a turn down with it.
        log.warn('could not write decision log for %s: %s', id, String(error));
      }
    });

    runWithDecisionJournal(journal, next);
  };
}
