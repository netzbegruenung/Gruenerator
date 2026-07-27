import { describe, expect, it } from 'vitest';

import { selectProgressStep } from './progressStepLabel';

import type { ProgressStep } from '@gruenerator/chat';

function step(label: string, status: ProgressStep['status']): ProgressStep {
  return { stage: 'searching', label, status };
}

describe('selectProgressStep', () => {
  it('names the step that is running', () => {
    const selected = selectProgressStep([
      step('Durchsuche Grundsatzprogramm', 'completed'),
      step('Lese Beschlüsse', 'in-progress'),
      step('Formuliere', 'pending'),
    ]);

    expect(selected).toEqual({ label: 'Lese Beschlüsse', failed: false });
  });

  // The loop can run several tools at once, so a failure may sit behind a step
  // that is still going. Showing the running one would hide it.
  it('reports a failure even when a later step is still running', () => {
    const selected = selectProgressStep([
      step('Lese Beschlüsse', 'failed'),
      step('Formuliere', 'in-progress'),
    ]);

    expect(selected).toEqual({ label: 'Lese Beschlüsse', failed: true });
  });

  it('falls back to the last step when none is marked in-progress', () => {
    const selected = selectProgressStep([
      step('Durchsuche', 'completed'),
      step('Lese Beschlüsse', 'pending'),
    ]);

    expect(selected).toEqual({ label: 'Lese Beschlüsse', failed: false });
  });

  it('stays quiet once everything is done — the answer takes this space', () => {
    expect(selectProgressStep([step('Durchsuche', 'completed')])).toBeNull();
  });

  it('stays quiet without steps, so the generic stage word keeps the line', () => {
    expect(selectProgressStep([])).toBeNull();
    expect(selectProgressStep(undefined)).toBeNull();
  });
});
