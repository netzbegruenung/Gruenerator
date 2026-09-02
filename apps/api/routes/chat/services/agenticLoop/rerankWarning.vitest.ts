/**
 * Der Ausfall des Cross-Encoders kann im Loop bis zu sechs Werkzeugaufrufe
 * treffen (MAX_SEARCH_CALLS). Gewarnt wird beim ERSTEN und danach nicht mehr:
 * die Antwort ist inhaltlich nicht falsch, nur schlechter sortiert, und sechs
 * gleichlautende Hinweise wären lauter als der Befund.
 */
import { describe, expect, it } from 'vitest';

import { createRerankDegradedHook } from './rerankWarning.js';

import type { SSEWriter } from '../sseHelpers.js';

function sseStub() {
  const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const sse = {
    send: (event: string, payload: Record<string, unknown>) => sent.push({ event, payload }),
    isEnded: () => false,
  } as unknown as SSEWriter;
  return { sse, sent };
}

function event(result: unknown, toolName = 'gruenerator_search') {
  return { toolName, args: {}, stepId: 's1', result, ok: true, mocked: false, durationMs: 12 };
}

describe('createRerankDegradedHook', () => {
  it('warnt beim ersten degradierten Ergebnis', () => {
    const { sse, sent } = sseStub();
    createRerankDegradedHook(sse).afterToolCall(event({ results: [], rerankDegraded: true }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.event).toBe('warning');
    expect(sent[0]?.payload.code).toBe('rerank_degraded');
  });

  it('warnt kein zweites Mal im selben Turn', () => {
    const { sse, sent } = sseStub();
    const hook = createRerankDegradedHook(sse);
    hook.afterToolCall(event({ results: [], rerankDegraded: true }));
    hook.afterToolCall(event({ results: [], rerankDegraded: true }));
    hook.afterToolCall(event({ results: [], rerankDegraded: true }));

    expect(sent).toHaveLength(1);
  });

  it('schweigt bei einem sauberen Ergebnis', () => {
    const { sse, sent } = sseStub();
    createRerankDegradedHook(sse).afterToolCall(event({ results: [] }));

    expect(sent).toHaveLength(0);
  });

  it('schweigt bei Ergebnissen, die keine Objekte sind', () => {
    const { sse, sent } = sseStub();
    const hook = createRerankDegradedHook(sse);
    hook.afterToolCall(event('nur Text'));
    hook.afterToolCall(event(null));

    expect(sent).toHaveLength(0);
  });

  it('nimmt nur ein echtes true, nicht irgendeinen wahrheitswertigen Wert', () => {
    const { sse, sent } = sseStub();
    createRerankDegradedHook(sse).afterToolCall(event({ rerankDegraded: 'ja' }));

    expect(sent).toHaveLength(0);
  });
});
