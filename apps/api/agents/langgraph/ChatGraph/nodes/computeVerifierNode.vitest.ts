import { describe, expect, it, vi } from 'vitest';

import { computeVerifierNode, parseVerifierResponse } from './computeVerifierNode.js';

import type { ChatGraphState, ComputeData } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function makeState(llmContent: string): ChatGraphState {
  return {
    searchQuery: 'wie hoch ist der gesamtumsatz?',
    pandasLastCode: 'print("Gesamtumsatz:", df["Umsatz"].sum())',
    aiWorkerPool: { processRequest: vi.fn().mockResolvedValue({ content: llmContent }) },
  } as unknown as ChatGraphState;
}

const RESULT: ComputeData = {
  operation: 'Tabellen-Berechnung',
  entries: [{ label: 'Gesamtumsatz', value: '147583.79' }],
  summary: 'Gesamtumsatz: 147583.79',
};

describe('parseVerifierResponse', () => {
  it('parses plausible and implausible verdicts', () => {
    expect(parseVerifierResponse('{"plausible": true}')).toEqual({ plausible: true });
    expect(parseVerifierResponse('{"plausible": false, "hint": "falsche Spalte"}')).toEqual({
      plausible: false,
      hint: 'falsche Spalte',
    });
  });

  it('parses a fenced JSON verdict', () => {
    expect(parseVerifierResponse('```json\n{"plausible": false, "hint": "x"}\n```')).toEqual({
      plausible: false,
      hint: 'x',
    });
  });

  it('fails open on broken or non-boolean payloads', () => {
    expect(parseVerifierResponse('kein json')).toEqual({ plausible: true });
    expect(parseVerifierResponse('{"plausible": "maybe"}')).toEqual({ plausible: true });
    expect(parseVerifierResponse('')).toEqual({ plausible: true });
  });
});

describe('computeVerifierNode', () => {
  it('returns the implausible verdict with hint', async () => {
    const state = makeState('{"plausible": false, "hint": "Umsatz doppelt hergeleitet"}');
    expect(await computeVerifierNode(state, RESULT)).toEqual({
      plausible: false,
      hint: 'Umsatz doppelt hergeleitet',
    });
    const call = (state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> })
      .processRequest.mock.calls[0][0];
    expect(call.messages[0].content).toContain('wie hoch ist der gesamtumsatz?');
    expect(call.messages[0].content).toContain('df["Umsatz"].sum()');
    expect(call.messages[0].content).toContain('147583.79');
    expect(call.options.response_format).toEqual({ type: 'json_object' });
  });

  it('fails open when the LLM call throws', async () => {
    const state = makeState('');
    (
      state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> }
    ).processRequest.mockRejectedValue(new Error('down'));
    expect(await computeVerifierNode(state, RESULT)).toEqual({ plausible: true });
  });

  it('skips the call entirely without question or code', async () => {
    const state = makeState('{"plausible": false}');
    (state as { pandasLastCode?: string }).pandasLastCode = undefined;
    expect(await computeVerifierNode(state, RESULT)).toEqual({ plausible: true });
    expect(
      (state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> }).processRequest
    ).not.toHaveBeenCalled();
  });
});
