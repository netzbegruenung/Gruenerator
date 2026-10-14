/**
 * Notebook source tier ("Ampel") — whether the parliament notebooks rank
 * Drucksachen ahead of protocol passages.
 *
 * - `equal`: every source competes on its own score (today's behaviour).
 * - `documents-first`: sources the collection marks as demoted (plenary and
 *   committee protocols) take a small rank penalty. Not a block and not a quota.
 *
 * Wire field `sourceTier` on `POST /api/chat-service/notebook/stream`. An
 * omitted field means `equal`. Collections that mark no source as demoted are
 * unaffected by either value.
 */
import { z } from 'zod';

export const notebookSourceTierSchema = z.enum(['equal', 'documents-first']);
export type NotebookSourceTier = z.infer<typeof notebookSourceTierSchema>;
