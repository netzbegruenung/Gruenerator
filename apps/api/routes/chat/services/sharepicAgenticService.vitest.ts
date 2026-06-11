import { describe, it, expect } from 'vitest';

import {
  applyOpsInputSchema,
  restoreInputSchema,
  createLoopGuards,
} from './sharepicAgenticGuards.js';

describe('applyOpsInputSchema', () => {
  it('accepts a valid set-text batch with summary', () => {
    const result = applyOpsInputSchema.safeParse({
      operations: [{ kind: 'set-text', field: 'line1', label: 'Zeile 1', value: 'GRÜN WIRKT' }],
      summary: 'Zeile 1 geändert',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty operation batches', () => {
    expect(applyOpsInputSchema.safeParse({ operations: [], summary: 'x' }).success).toBe(false);
  });

  it('rejects more than 8 operations', () => {
    const op = { kind: 'set-text', field: 'line1', label: 'Zeile 1', value: 'x' };
    const result = applyOpsInputSchema.safeParse({
      operations: Array.from({ length: 9 }, () => op),
      summary: 'zu viele',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown operation kinds', () => {
    const result = applyOpsInputSchema.safeParse({
      operations: [{ kind: 'resize-canvas', format: 'story' }],
      summary: 'nicht erlaubt',
    });
    expect(result.success).toBe(false);
  });
});

describe('restoreInputSchema', () => {
  it('accepts positive integer versions and rejects zero/floats', () => {
    expect(restoreInputSchema.safeParse({ version: 3 }).success).toBe(true);
    expect(restoreInputSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(restoreInputSchema.safeParse({ version: 1.5 }).success).toBe(false);
  });
});

describe('createLoopGuards', () => {
  it('rejects an exactly repeated consecutive call, allows a changed one', () => {
    const guards = createLoopGuards();
    const input = { operations: [{ kind: 'toggle-sunflower', visible: false }], summary: 'a' };
    expect(guards.checkDuplicate('apply_sharepic_ops', input)).toBeNull();
    expect(guards.checkDuplicate('apply_sharepic_ops', input)).not.toBeNull();
    expect(guards.checkDuplicate('apply_sharepic_ops', { ...input, summary: 'b' })).toBeNull();
  });

  it('treats the same input on a different tool as a new call', () => {
    const guards = createLoopGuards();
    expect(guards.checkDuplicate('read_sharepic_state', {})).toBeNull();
    expect(guards.checkDuplicate('apply_sharepic_ops', {})).toBeNull();
  });

  it('caps failures per tool at 2 without affecting other tools', () => {
    const guards = createLoopGuards();
    expect(guards.checkFailureCap('apply_sharepic_ops')).toBeNull();
    guards.noteFailure('apply_sharepic_ops');
    expect(guards.checkFailureCap('apply_sharepic_ops')).toBeNull();
    guards.noteFailure('apply_sharepic_ops');
    expect(guards.checkFailureCap('apply_sharepic_ops')).not.toBeNull();
    expect(guards.checkFailureCap('restore_version')).toBeNull();
  });
});
