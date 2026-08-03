import { type RequestHandler } from 'express';

import {
  createDecisionJournal,
  runWithDecisionJournal,
  type DecisionJournal,
} from '../../../../utils/decisionJournal.js';

/**
 * Binds a fresh decision journal per request and hands it back to the test.
 *
 * Mounted as express middleware for the same reason `runWithUsageContext` is in
 * routes.ts: the AsyncLocalStorage store survives the await chain, so every
 * `recordDecision` in the ~2300-line handler and everything it calls lands in
 * the right turn's journal without a single parameter being threaded.
 *
 * In production nothing binds a journal, so every one of those calls is a
 * `getStore()` returning undefined and an immediate return.
 */
export interface JournalCapture {
  /** The journal of the most recently completed request. */
  last: () => DecisionJournal;
  /** All journals since the last reset, oldest first (multi-turn scenarios). */
  all: () => DecisionJournal[];
  reset: () => void;
  middleware: RequestHandler;
}

export function createJournalCapture(): JournalCapture {
  let journals: DecisionJournal[] = [];

  return {
    last(): DecisionJournal {
      const journal = journals.at(-1);
      if (!journal) throw new Error('no decision journal captured yet');
      return journal;
    },
    all: () => [...journals],
    reset(): void {
      journals = [];
    },
    middleware(_req, _res, next): void {
      const journal = createDecisionJournal();
      journals.push(journal);
      runWithDecisionJournal(journal, next);
    },
  };
}
