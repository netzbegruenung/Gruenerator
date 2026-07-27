import type { ProgressStep } from '@gruenerator/chat';

/**
 * Which of the agentic loop's steps the running status line should name.
 *
 * When the backend sends a step list, the individual step ("Durchsuche
 * Grundsatzprogramm") is more informative than the generic stage word
 * ("Durchsuche …") the plain indicator falls back to. Same selection as web's
 * `ProgressTracker`, extracted because the interesting part is the order of
 * precedence and the two silent cases.
 */

export interface ProgressStepLabel {
  label: string;
  failed: boolean;
}

export function selectProgressStep(
  steps: readonly ProgressStep[] | undefined
): ProgressStepLabel | null {
  if (!steps || steps.length === 0) return null;

  // A failure outranks everything: it is the one state the user has to see, and
  // a later step may already be running past it.
  const failed = steps.find((s) => s.status === 'failed');
  if (failed) return { label: failed.label, failed: true };

  const active = steps.find((s) => s.status === 'in-progress') ?? steps[steps.length - 1];
  // Nothing in flight — the answer is about to take this space, so stay quiet
  // rather than leave a finished step standing.
  if (!active || active.status === 'completed') return null;

  return { label: active.label, failed: false };
}
