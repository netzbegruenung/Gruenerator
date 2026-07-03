import { describe, expect, it } from 'vitest';

import { hasBrokenComputeValues } from './computeResultSanity.js';
import { resolveResumeInput } from './resumeInput.js';

describe('resolveResumeInput', () => {
  // Regression guard: the ask_human clarification resume must keep working
  // exactly as before while the client-tool path is added around it.
  it('treats a bare `resume` string as an ask_human answer', () => {
    expect(resolveResumeInput({ threadId: 'x', resume: 'Berlin' } as never)).toEqual({
      kind: 'ask_human',
      answer: 'Berlin',
    });
  });

  it('accepts an empty-string ask_human answer', () => {
    expect(resolveResumeInput({ resume: '' })).toEqual({ kind: 'ask_human', answer: '' });
  });

  it('treats a toolName + result as a client_tool resume', () => {
    const result = { operation: 'Tabellen-Berechnung', entries: [], summary: 'Gesamtgewinn: 51' };
    expect(resolveResumeInput({ toolName: 'run_python', result })).toEqual({
      kind: 'client_tool',
      toolName: 'run_python',
      result,
    });
  });

  it('lets toolName win when both are present (explicit client-tool resume)', () => {
    expect(resolveResumeInput({ resume: 'ignored', toolName: 'run_python', result: 42 })).toEqual({
      kind: 'client_tool',
      toolName: 'run_python',
      result: 42,
    });
  });

  it('returns null when neither field is present', () => {
    expect(resolveResumeInput({})).toBeNull();
    expect(resolveResumeInput({ toolName: '' })).toBeNull();
  });
});

describe('hasBrokenComputeValues', () => {
  const entry = (value: string) => ({ value });

  it('flags all-nan and empty results', () => {
    expect(hasBrokenComputeValues({ entries: [entry('nan')] })).toBe(true);
    expect(hasBrokenComputeValues({ entries: [entry('')] })).toBe(true);
    expect(hasBrokenComputeValues({ entries: [] })).toBe(true);
  });

  it('flags the beta case: nan key next to one real number (half nan-ish)', () => {
    expect(hasBrokenComputeValues({ entries: [entry('nan'), entry('51099.75')] })).toBe(true);
  });

  it('tolerates isolated NaN among real values (missing spreadsheet data)', () => {
    expect(
      hasBrokenComputeValues({
        entries: [entry('123'), entry('456'), entry('789'), entry('nan')],
      })
    ).toBe(false);
  });

  it('never flags results that carry figures or files (export/chart-only runs)', () => {
    expect(hasBrokenComputeValues({ entries: [entry('')], figures: ['abc'] })).toBe(false);
    expect(
      hasBrokenComputeValues({ entries: [entry('')], files: [{ name: 'a.csv', b64: 'x' }] })
    ).toBe(false);
    // Post-storage payloads carry URLs instead of base64 — same exemption.
    expect(hasBrokenComputeValues({ entries: [entry('')], figureUrls: ['/api/x.png'] })).toBe(
      false
    );
    expect(
      hasBrokenComputeValues({
        entries: [entry('')],
        fileAssets: [{ name: 'a.csv', url: '/api/x.csv' }],
      })
    ).toBe(false);
  });
});
