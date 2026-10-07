/**
 * runCanvasSuggest — filtering, repair and failure reporting.
 *
 * This path had no coverage at all while it was the third hand-rolled copy of
 * the forced-tool-call loop. The cases that matter are the ones the old blind
 * retry got wrong: a suggestion set the canvas cannot apply, and a schema
 * violation that a second identical prompt had no reason to fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();

vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { runCanvasSuggest } = await import('./runCanvasSuggest.js');

import type { CanvasAiSnapshot } from '@gruenerator/contracts';

const TOOL_NAME = 'submit_canvas_operations';

const SNAPSHOT: CanvasAiSnapshot = {
  template: 'simple',
  textFields: [{ field: 'headline', label: 'Headline', value: 'Alter Text' }],
  elementsSummary: [],
};

const setText = { kind: 'set-text', field: 'headline', label: 'Headline', value: 'Kurz' };
// A real operation kind that a canvas may legitimately not support.
const removeElement = { kind: 'remove-element', elementId: 'el-1' };

function batch(op: unknown, title = 'Vorschlag') {
  return { title, operations: [op] };
}

/** Successive attempts return the given tool payloads in order. */
function answering(...payloads: unknown[]): {
  calls: { messages: { role: string; content: string }[] }[];
} {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  let i = 0;
  executeProvider.mockImplementation(
    (
      _provider: string,
      _id: string,
      request: { messages: { role: string; content: string }[] }
    ) => {
      calls.push({ messages: request.messages });
      const payload = payloads[Math.min(i, payloads.length - 1)];
      i++;
      return Promise.resolve({
        content: null,
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: TOOL_NAME, input: payload }],
      });
    }
  );
  return { calls };
}

function run(supportedOperations: string[]) {
  return runCanvasSuggest({
    prompt: 'Mach den Text kürzer',
    snapshot: SNAPSHOT,
    capabilities: { supportedOperations },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  executeProvider.mockReset();
});

describe('runCanvasSuggest', () => {
  it('drops operations this canvas does not support', async () => {
    answering({ title: 'Gemischt', operations: [setText, removeElement] });

    const result = await run(['set-text']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe('Gemischt');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].kind).toBe('set-text');
  });

  it('repairs once when nothing supported survives, naming the supported kinds', async () => {
    const { calls } = answering(batch(removeElement), batch(setText));

    const result = await run(['set-text']);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    // The repair prompt must carry the reason — a blind retry of the identical
    // prompt is exactly what this replaced.
    const repairText = calls[1].messages.map((m) => m.content).join('\n');
    expect(repairText).toContain('set-text');
    expect(repairText).toMatch(/unterstützte Operation/i);
  });

  it('repairs exactly once on a schema violation, then gives up', async () => {
    const { calls } = answering({ operations: 'not-an-array' });

    const result = await run(['set-text']);

    expect(result.ok).toBe(false);
    // Two attempts total: the original plus one repair. Not more.
    expect(calls).toHaveLength(2);
  });

  it('rejects the old multi-suggestion shape', async () => {
    answering({ suggestions: [batch(setText)] });

    const result = await run(['set-text']);

    expect(result.ok).toBe(false);
  });

  it('asks the model for exactly one batch, not 3-5 alternatives', async () => {
    const { calls } = answering(batch(setText));

    await run(['set-text']);

    const sent = calls[0].messages.map((m) => m.content).join('\n');
    expect(sent).not.toMatch(/3 bis 5/);
    expect(sent).not.toContain('"suggestions"');
    expect(sent).toMatch(/genau (einen|ein)/i);
  });

  it('surfaces the provider error rather than an empty success', async () => {
    executeProvider.mockRejectedValue(new Error('upstream 503'));

    const result = await run(['set-text']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('upstream 503');
  });
});
