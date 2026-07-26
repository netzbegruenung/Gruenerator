import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import {
  buildRepairInstruction,
  formatZodIssuesForModel,
  makeInvalidEnumHint,
  makeInvalidShapeHint,
  toolErrorResult,
  withRepairRetry,
  type ParseOutcome,
} from './agentFacing.js';

const SUBTYPES = ['blank', 'antrag', 'pressemitteilung'] as const;

describe('makeInvalidEnumHint', () => {
  it('names the offending value and enumerates the valid ones', () => {
    const hint = makeInvalidEnumHint('subtype', 'brief', SUBTYPES);
    expect(hint).toContain('"brief"');
    expect(hint).toContain('blank, antrag, pressemitteilung');
  });
});

describe('makeInvalidShapeHint', () => {
  it('states the expected shape', () => {
    expect(makeInvalidShapeHint('{title, subtype, content}')).toContain(
      '{title, subtype, content}'
    );
  });
});

describe('formatZodIssuesForModel', () => {
  it('flattens issues into a path: message list', () => {
    const schema = z.object({ cron: z.string(), title: z.string() });
    const result = schema.safeParse({ cron: 5 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const formatted = formatZodIssuesForModel(result.error);
    expect(formatted).toContain('cron:');
    expect(formatted).toContain('title:');
  });
});

describe('toolErrorResult', () => {
  it('flags the result so the loop renders a failed card', () => {
    expect(toolErrorResult('kaputt')).toEqual({ error: true, message: 'kaputt' });
  });

  it('passes the valid values through so the model can self-correct', () => {
    expect(toolErrorResult('bad subtype', ['antrag'])).toEqual({
      error: true,
      message: 'bad subtype',
      expected: ['antrag'],
    });
  });

  it('omits an empty expected list', () => {
    expect(toolErrorResult('kaputt', [])).not.toHaveProperty('expected');
  });
});

describe('withRepairRetry', () => {
  const parseSubtype =
    () =>
    (raw: string): ParseOutcome<string> =>
      SUBTYPES.includes(raw as (typeof SUBTYPES)[number])
        ? { ok: true, value: raw }
        : { ok: false, hint: makeInvalidEnumHint('subtype', raw, SUBTYPES) };

  it('returns the value without a repair call when the first response is valid', async () => {
    const invoke = vi.fn().mockResolvedValue('antrag');

    const outcome = await withRepairRetry({ invoke, parse: parseSubtype(), label: 'test' });

    expect(outcome).toEqual({ ok: true, value: 'antrag' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(undefined);
  });

  it('retries ONCE with a hint naming the violation and the valid values', async () => {
    const invoke = vi.fn().mockResolvedValueOnce('brief').mockResolvedValueOnce('antrag');

    const outcome = await withRepairRetry({ invoke, parse: parseSubtype(), label: 'test' });

    expect(outcome).toEqual({ ok: true, value: 'antrag' });
    expect(invoke).toHaveBeenCalledTimes(2);
    const repairHint = invoke.mock.calls[1][0] as string;
    expect(repairHint).toContain('"brief"');
    expect(repairHint).toContain('antrag');
  });

  it('reports the hint when the repair attempt is still invalid — never coerces', async () => {
    const invoke = vi.fn().mockResolvedValue('brief');

    const outcome = await withRepairRetry({ invoke, parse: parseSubtype(), label: 'test' });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.hint).toContain('"brief"');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('surfaces a transient invocation failure instead of swallowing it', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('timeout'));

    const outcome = await withRepairRetry({ invoke, parse: parseSubtype(), label: 'test' });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.hint).toContain('timeout');
  });
});

describe('buildRepairInstruction', () => {
  it('embeds the hint in a corrective instruction', () => {
    const instruction = buildRepairInstruction('invalid subtype "brief"');
    expect(instruction).toContain('invalid subtype "brief"');
  });
});
