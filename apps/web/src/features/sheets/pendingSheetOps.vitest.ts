import { describe, expect, it, vi } from 'vitest';

import { drainPendingSheetOps } from './pendingSheetOps';

const validOp = { type: 'set_range_values', range: 'A1', values: [['x']] };

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    claim: vi.fn(async () => [] as Array<{ id: string; operations: unknown[]; summary: string }>),
    apply: vi.fn(async (ops: unknown[]) => ({ applied: ops.length, skipped: [] as string[] })),
    aiEditEnabled: true,
    ...overrides,
  };
}

describe('drainPendingSheetOps', () => {
  it('does not claim when AI editing is locked', async () => {
    const params = makeParams({ aiEditEnabled: false });
    const result = await drainPendingSheetOps(params);
    expect(result).toEqual({ status: 'locked' });
    expect(params.claim).not.toHaveBeenCalled();
  });

  it('drops invalid operations and skips empty batches', async () => {
    const params = makeParams({
      claim: vi.fn(async () => [
        { id: 'a', operations: [{ type: 'nope' }, 42], summary: '' },
        { id: 'b', operations: [validOp, { type: 'nope' }], summary: '' },
      ]),
    });
    const result = await drainPendingSheetOps(params);
    expect(params.apply).toHaveBeenCalledTimes(1);
    expect(params.apply.mock.calls[0][0]).toHaveLength(1);
    expect(result).toEqual({ status: 'applied', applied: 1, skipped: [] });
  });

  it('sums results across batches', async () => {
    const params = makeParams({
      claim: vi.fn(async () => [
        { id: 'a', operations: [validOp], summary: '' },
        { id: 'b', operations: [validOp, validOp], summary: '' },
      ]),
      apply: vi.fn(async (ops: unknown[]) => ({ applied: ops.length, skipped: ['x'] })),
    });
    const result = await drainPendingSheetOps(params);
    expect(result).toEqual({ status: 'applied', applied: 3, skipped: ['x', 'x'] });
  });

  it('coalesces overlapping calls into at most one rerun', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const params = makeParams({
      claim: vi.fn(async () => {
        await gate;
        return [];
      }),
    });
    const first = drainPendingSheetOps(params);
    const second = drainPendingSheetOps(params);
    const third = drainPendingSheetOps(params);
    release();
    await Promise.all([first, second, third]);
    expect(params.claim).toHaveBeenCalledTimes(2);
  });
});
