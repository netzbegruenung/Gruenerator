/**
 * Pure, dependency-light parts of the agentic sharepic loop: tool input
 * schemas and per-turn guard state. Separate file so unit tests don't import
 * the service's heavy transitive dependencies (DB, providers, env parsing).
 */
import { canvasAiOperationSchema, sliderDeckOperationSchema } from '@gruenerator/contracts';
import { z } from 'zod';

export const MAX_FAILURES_PER_TOOL = 2;

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

/**
 * Pure guard state for one loop turn: rejects an exactly repeated tool call
 * (model ping-pong) and caps failures per tool so the loop can't burn all its
 * steps on the same broken idea.
 */
export function createLoopGuards() {
  let lastKey = '';
  const failures = new Map<string, number>();
  return {
    checkDuplicate(toolName: string, input: unknown): string | null {
      const key = `${toolName}:${JSON.stringify(input)}`;
      if (key === lastKey) {
        return 'Identischer Aufruf wiederholt — ändere die Parameter oder antworte dem*der Nutzer*in direkt.';
      }
      lastKey = key;
      return null;
    },
    noteFailure(toolName: string): void {
      failures.set(toolName, (failures.get(toolName) ?? 0) + 1);
    },
    checkFailureCap(toolName: string): string | null {
      if ((failures.get(toolName) ?? 0) >= MAX_FAILURES_PER_TOOL) {
        return 'Zu viele Fehlversuche mit diesem Tool — erkläre dem*der Nutzer*in, was nicht geklappt hat.';
      }
      return null;
    },
  };
}
