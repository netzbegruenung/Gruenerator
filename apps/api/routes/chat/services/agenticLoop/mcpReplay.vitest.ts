import { describe, it, expect } from 'vitest';

import { buildMcpReplayMessages } from './mcpReplay.js';

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

const catalog = new Set(['ma__search', 'mb__send']);

describe('buildMcpReplayMessages', () => {
  it('reconstructs a valid assistant tool-call + tool-result pair', () => {
    const msgs = buildMcpReplayMessages([mcpStep()], catalog);
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

  it('excludes internal (non-MCP) steps — no serverName', () => {
    const internal = mcpStep({ serverName: undefined, toolName: 'gruenerator_search' });
    expect(buildMcpReplayMessages([internal], catalog)).toEqual([]);
  });

  it('validity gate: drops steps whose tool is not in the current catalog', () => {
    const gone = mcpStep({ toolName: 'mz__deleted' });
    expect(buildMcpReplayMessages([gone], catalog)).toEqual([]);
  });

  it('dedups repeated tool call ids', () => {
    const msgs = buildMcpReplayMessages([mcpStep(), mcpStep()], catalog);
    expect((msgs[0].content as unknown[]).length).toBe(1);
  });

  it('caps to the most recent maxSteps (oldest dropped)', () => {
    const steps = Array.from({ length: 5 }, (_, i) =>
      mcpStep({ toolCallId: `c${i}`, args: { i } })
    );
    const msgs = buildMcpReplayMessages(steps, catalog, { maxSteps: 2 });
    const ids = (msgs[0].content as Array<{ toolCallId: string }>).map((c) => c.toolCallId);
    expect(ids).toEqual(['c3', 'c4']);
  });

  it('empty input → [] (loop history unchanged)', () => {
    expect(buildMcpReplayMessages([], catalog)).toEqual([]);
  });

  it('truncates a huge result value', () => {
    const big = mcpStep({ result: { content: 'x'.repeat(2000) } });
    const msgs = buildMcpReplayMessages([big], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out.length).toBeLessThan(600);
    expect(out.endsWith('…')).toBe(true);
  });
});
