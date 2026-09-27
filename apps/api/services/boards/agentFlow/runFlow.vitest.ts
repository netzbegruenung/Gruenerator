/**
 * Die Handoff-Regel der Grünerator-Spalte (#3221): ein Ergebnis, das die
 * Prüfung auch nach der Reparatur beanstandet, wird zur Freigabe geparkt statt
 * still abgeschlossen — auch ohne `require_review`.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { type AgentTask } from '../../../database/schema/agentTasks.js';

const runVerifiedTurn = vi.fn();
vi.mock('../../backgroundRuns/verifiedTurn.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../backgroundRuns/verifiedTurn.js')>()),
  runVerifiedTurn: (...args: unknown[]) => runVerifiedTurn(...args),
}));

const completeAgentTask = vi.fn();
const parkTaskForReview = vi.fn();
vi.mock('../agentTaskService.js', () => ({
  BOARD_TURN_DEADLINE_MS: 240_000,
  BOARD_REPAIR_DEADLINE_MS: 180_000,
  completeAgentTask: (...args: unknown[]) => completeAgentTask(...args),
  parkTaskForReview: (...args: unknown[]) => parkTaskForReview(...args),
}));

const createNotification = vi.fn();
vi.mock('../../notifications/NotificationService.js', () => ({
  createNotification: (...args: unknown[]) => createNotification(...args),
}));

vi.mock('./sources/index.js', () => ({ resolveSourceText: vi.fn(async () => 'Quelltext') }));
vi.mock('./outputs/index.js', () => ({
  executeOutputs: vi.fn(async () => ({ documentId: 'doc-1' })),
}));

const { runFlow } = await import('./runFlow.js');

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    board_id: 'b1',
    card_id: 'c1',
    requested_by: 'u1',
    locale: 'de-DE',
    require_review: false,
    flow_config: {
      source: { type: 'none' },
      task: { type: 'custom', prompt: 'Fasse zusammen' },
      outputs: [{ type: 'document' }],
      cardContext: { title: 'Karte', description: '' },
    },
    ...overrides,
  } as AgentTask;
}

function turnResult(verdict: unknown, degraded = 'none') {
  return {
    turn: { degraded, degradedReason: null, text: 'Ergebnis' },
    content: degraded === 'none' ? 'Ergebnis' : '',
    verdict,
  };
}

describe('runFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schliesst ein bestandenes Ergebnis ab und speichert das Verdikt', async () => {
    runVerifiedTurn.mockResolvedValue(turnResult({ ok: true }));
    await runFlow(task());

    expect(completeAgentTask).toHaveBeenCalledWith('t1', 'doc-1', { ok: true });
    expect(parkTaskForReview).not.toHaveBeenCalled();
    // Geprüft wird gegen die Aufgabe, nicht gegen die angehängten Quelldaten.
    const [params, opts] = runVerifiedTurn.mock.calls[0]! as [
      { instruction: string },
      { verifyInstruction: string },
    ];
    expect(params.instruction).toContain('QUELLDATEN');
    expect(opts.verifyInstruction).not.toContain('QUELLDATEN');
  });

  it('parkt ein weiter beanstandetes Ergebnis zur Freigabe, auch ohne require_review', async () => {
    const verdict = { ok: false, hint: 'Thema verfehlt', repaired: true };
    runVerifiedTurn.mockResolvedValue(turnResult(verdict));
    await runFlow(task());

    expect(parkTaskForReview).toHaveBeenCalledWith('t1', 'doc-1', verdict);
    expect(completeAgentTask).not.toHaveBeenCalled();
    const note = createNotification.mock.calls[0]![0] as { type: string; body: string };
    expect(note.type).toBe('agent_task_awaiting_review');
    expect(note.body).toContain('Thema verfehlt');
  });

  it('wirft bei einem abgebrochenen Lauf, statt Ersatztext auszuliefern', async () => {
    runVerifiedTurn.mockResolvedValue(turnResult(null, 'aborted'));
    await expect(runFlow(task())).rejects.toThrow(/degraded: aborted/);
    expect(completeAgentTask).not.toHaveBeenCalled();
  });
});
