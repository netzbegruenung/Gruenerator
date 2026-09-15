import { describe, it, expect } from 'vitest';

import { buildToolObservationReplay, spliceToolReplay } from './mcpReplay.js';

import type { PersistedStep } from './types.js';
import type { ModelMessage } from 'ai';

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

  it('never leaks a step narration into the replayed model messages', () => {
    // Narration is a UI-only field; the model must not see the announcement
    // prose as part of cross-turn tool observations.
    const withNarration = mcpStep({ narration: 'Ich suche jetzt nach Klima-Beschlüssen.' });
    const serialized = JSON.stringify(buildToolObservationReplay([withNarration], catalog));
    expect(serialized).not.toContain('Ich suche jetzt');
    expect(serialized).not.toContain('narration');
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
  it('never leaks rerankDegraded into a replayed tool-result, but keeps the rest', () => {
    // The persisted step is intentionally raw (card + debugging) — the strip
    // must happen here, at replay serialization, not before recordStep.
    const degraded = mcpStep({
      toolName: 'gruenerator_search',
      serverName: undefined,
      result: { results: [{ title: 'Klimaschutz' }], rerankDegraded: true },
    });
    const msgs = buildToolObservationReplay([degraded], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out).not.toContain('rerankDegraded');
    expect(out).toContain('Klimaschutz');
  });

  it('gives a knowledge result the same replay budget as a source block', () => {
    // `product_knowledge` registers no sources, so it fell into the 500-char
    // action preview: live on 03.08.2026 its replay was cut from 3.876 to 500
    // characters, and the next turn described the product from an eighth of
    // what it had just been told.
    const step = mcpStep({
      toolName: 'gruenerator_search',
      serverName: undefined,
      result: { knowledge: 'K'.repeat(3800) },
    });
    const msgs = buildToolObservationReplay([step], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out.length).toBeGreaterThan(3000);
  });
});

describe('spliceToolReplay', () => {
  const history: ModelMessage[] = [
    { role: 'user', content: 'was steht im wahlprogramm?' },
    { role: 'assistant', content: 'Dazu habe ich gesucht.' },
    { role: 'user', content: 'und morgen?' },
  ];
  const replay = buildToolObservationReplay([mcpStep()], catalog);

  it('never lets a user message follow a tool message', () => {
    // mistral-common (GreenPT, Mistral API) rejects that transition with 400.
    const out = spliceToolReplay(history, replay);
    const roles = out.map((m) => m.role);
    for (let i = 1; i < roles.length; i++) {
      expect(`${roles[i - 1]}→${roles[i]}`).not.toBe('tool→user');
    }
    expect(roles).toEqual(['user', 'assistant', 'assistant', 'tool', 'assistant', 'user']);
  });

  it('keeps the current user message last and the replay pair adjacent', () => {
    const out = spliceToolReplay(history, replay);
    expect(out[out.length - 1]).toBe(history[history.length - 1]);
    expect(out.indexOf(replay[1])).toBe(out.indexOf(replay[0]) + 1);
  });

  it('adds no bridge when the last message is not a user message', () => {
    const ending: ModelMessage[] = [{ role: 'assistant', content: 'weiter' }];
    expect(spliceToolReplay(ending, replay)).toEqual([...replay, ending[0]]);
  });

  it('passes the history through untouched when there is no replay', () => {
    expect(spliceToolReplay(history, [])).toEqual(history);
    expect(spliceToolReplay([], replay)).toEqual([]);
  });
});
