import { describe, it, expect } from 'vitest';

import { buildToolObservationReplay } from './mcpReplay.js';

import type { PersistedStep } from './types.js';

function mcpStep(over: Partial<PersistedStep> = {}): PersistedStep {
  return {
    toolCallId: 'c1',
    toolName: 'ma__search',
    args: { q: 'klima' },
    result: { content: 'Treffer' },
    serverName: 'Notion',
    ...over,
  };
}

const catalog = new Set(['ma__search', 'mb__send', 'gruenerator_search', 'bundestag']);

describe('buildToolObservationReplay', () => {
  it('reconstructs a valid assistant tool-call + tool-result pair', () => {
    const msgs = buildToolObservationReplay([mcpStep()], catalog);
    expect(msgs).toHaveLength(2);
    const [assistant, tool] = msgs;
    expect(assistant.role).toBe('assistant');
    expect(tool.role).toBe('tool');
    const call = (assistant.content as Array<Record<string, unknown>>)[0];
    const res = (tool.content as Array<Record<string, unknown>>)[0];
    expect(call).toMatchObject({ type: 'tool-call', toolCallId: 'c1', toolName: 'ma__search' });
    expect(res).toMatchObject({ type: 'tool-result', toolCallId: 'c1', toolName: 'ma__search' });
    // every tool-result pairs with a preceding tool-call of the same id
    expect((res as { toolCallId: string }).toolCallId).toBe(
      (call as { toolCallId: string }).toolCallId
    );
  });

  it('replays internal (non-MCP) steps too — no serverName required', () => {
    const internal = mcpStep({ serverName: undefined, toolName: 'gruenerator_search' });
    const msgs = buildToolObservationReplay([internal], catalog);
    expect(msgs).toHaveLength(2);
    const call = (msgs[0].content as Array<{ toolName: string }>)[0];
    expect(call.toolName).toBe('gruenerator_search');
  });

  it('replays a domain retrieval step (bundestag)', () => {
    const step = mcpStep({ serverName: undefined, toolName: 'bundestag', toolCallId: 'b1' });
    const msgs = buildToolObservationReplay([step], catalog);
    expect(msgs).toHaveLength(2);
  });

  it('validity gate: drops steps whose tool is not in the current catalog', () => {
    const gone = mcpStep({ toolName: 'mz__deleted' });
    expect(buildToolObservationReplay([gone], catalog)).toEqual([]);
  });

  it('dedups repeated tool call ids', () => {
    const msgs = buildToolObservationReplay([mcpStep(), mcpStep()], catalog);
    expect((msgs[0].content as unknown[]).length).toBe(1);
  });

  it('caps to the most recent maxSteps (oldest dropped)', () => {
    const steps = Array.from({ length: 5 }, (_, i) =>
      mcpStep({ toolCallId: `c${i}`, args: { i } })
    );
    const msgs = buildToolObservationReplay(steps, catalog, { maxSteps: 2 });
    const ids = (msgs[0].content as Array<{ toolCallId: string }>).map((c) => c.toolCallId);
    expect(ids).toEqual(['c3', 'c4']);
  });

  it('empty input → [] (loop history unchanged)', () => {
    expect(buildToolObservationReplay([], catalog)).toEqual([]);
  });

  it('truncates a huge result value', () => {
    const big = mcpStep({ result: { content: 'x'.repeat(2000) } });
    const msgs = buildToolObservationReplay([big], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out.length).toBeLessThan(600);
    expect(out.endsWith('…')).toBe(true);
  });

  it('strips embedded [N] citation markers so the current turn owns the namespace', () => {
    // A replayed search result carries its own numbered source block.
    const step = mcpStep({
      toolName: 'gruenerator_search',
      serverName: undefined,
      result: { sources: '[1] Wahlprogramm — SPD stimmte zu [2] Rede von X' },
    });
    const msgs = buildToolObservationReplay([step], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out).not.toMatch(/\[\d+\]/);
    // the surrounding text survives, only the markers are gone
    expect(out).toContain('Wahlprogramm');
  });
});
