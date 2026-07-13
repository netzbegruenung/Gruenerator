/**
 * Pure, dependency-light parts of the agentic sharepic loop: tool input
 * schemas and per-turn guard state. Separate file so unit tests don't import
 * the service's heavy transitive dependencies (DB, providers, env parsing).
 */
import { canvasAiOperationSchema, sliderDeckOperationSchema } from '@gruenerator/contracts';
import { z } from 'zod';

// The guard state is now the generalized agentic-loop guard. The sharepic loop
// uses only its first three methods (duplicate/failure-cap), whose semantics are
// identical to the original inline version — so this is a pure re-export, no
// behaviour change.
export {
  MAX_FAILURES_PER_TOOL,
  createToolLoopGuards as createLoopGuards,
} from './agenticLoop/loopGuards.js';

export const applyOpsInputSchema = z.object({
  operations: z.array(canvasAiOperationSchema).min(1).max(8),
  summary: z.string().min(1).max(120),
});

export const applySliderOpsInputSchema = z.object({
  operations: z.array(sliderDeckOperationSchema).min(1).max(6),
  summary: z.string().min(1).max(120),
});

export const restoreInputSchema = z.object({
  version: z.number().int().min(1),
});
