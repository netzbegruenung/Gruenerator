import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiDecide = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/ai/decide.js', () => ({ aiDecide }));
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { resolveEditTarget } from './editTargetResolver.js';

import type { ThreadToolContext } from '../types.js';

const SHAREPIC: ThreadToolContext = { kind: 'sharepic', ref: null, label: 'Radweg Altdorf' };
const DOCUMENT: ThreadToolContext = { kind: 'document', ref: 'doc-1', label: 'Antrag Radweg' };
const chose = (choice: string) => ({ target: { choice, confidence: 0.8, probabilities: {} } });

beforeEach(() => aiDecide.mockReset());

describe('resolveEditTarget', () => {
  it('offers one option per artifact plus "keines", described by what the kind is made of', async () => {
    aiDecide.mockResolvedValueOnce(chose('2'));
    expect(
      await resolveEditTarget({
        userContent: 'Kürze die Begründung',
        artifacts: [SHAREPIC, DOCUMENT],
      })
    ).toBe(1);
    const call = aiDecide.mock.calls[0]![0] as {
      state: string;
      timeoutMs: number;
      questions: { target: { criteria: Record<string, string> } };
    };
    expect(call.state).toBe(
      'ARTEFAKTE DIESES GESPRÄCHS (1 = zuletzt erzeugt):\n1. Sharepic („Radweg Altdorf")\n2. Dokument („Antrag Radweg")\n\nFOLGEAUFTRAG:\nKürze die Begründung'
    );
    expect(call.timeoutMs).toBe(900);
    const criteria = call.questions.target.criteria;
    expect(Object.keys(criteria)).toEqual(['1', '2', 'keines']);
    expect(criteria['1']).toMatch(/^Sharepic \(„Radweg Altdorf"\) – .*Kacheln/);
  });

  it.each([
    ['"keines"', () => aiDecide.mockResolvedValueOnce(chose('keines'))],
    ['a number outside the list', () => aiDecide.mockResolvedValueOnce(chose('3'))],
    ['a failure', () => aiDecide.mockRejectedValueOnce(new Error('no decision host answered'))],
  ])('returns null on %s', async (_label, arrange) => {
    arrange();
    expect(
      await resolveEditTarget({ userContent: 'Mach das anders', artifacts: [SHAREPIC, DOCUMENT] })
    ).toBeNull();
  });

  it('does not ask with fewer than two artifacts', async () => {
    expect(await resolveEditTarget({ userContent: 'Kürze das', artifacts: [SHAREPIC] })).toBeNull();
    expect(aiDecide).not.toHaveBeenCalled();
  });
});
