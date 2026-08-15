/**
 * runCanvasSuggest — filtering, repair and failure reporting.
 *
 * This path had no coverage at all while it was the third hand-rolled copy of
 * the forced-tool-call loop. The cases that matter are the ones the old blind
 * retry got wrong: a suggestion set the canvas cannot apply, and a schema
 * violation that a second identical prompt had no reason to fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runCanvasSuggest } from './runCanvasSuggest.js';

import type { CanvasAiSnapshot } from '@gruenerator/contracts';
import type { AiClient } from '../../../services/ai/types.js';

const TOOL_NAME = 'submit_canvas_suggestions';

const SNAPSHOT: CanvasAiSnapshot = {
  template: 'simple',
  textFields: [{ field: 'headline', label: 'Headline', value: 'Alter Text' }],
  elementsSummary: [],
};

const setText = { kind: 'set-text', field: 'headline', label: 'Headline', value: 'Kurz' };
// A real operation kind that a canvas may legitimately not support.
const removeElement = { kind: 'remove-element', elementId: 'el-1' };

function suggestion(op: unknown, id = 's1') {
  return { id, title: `Vorschlag ${id}`, operations: [op] };
}

/** A pool whose successive calls return the given tool payloads in order. */
function poolReturning(...payloads: unknown[]): {
  pool: AiClient;
  calls: { messages: { role: string; content: string }[] }[];
} {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  let i = 0;
  const pool = {
    processRequest: vi.fn(async (request: { messages: { role: string; content: string }[] }) => {
      calls.push({ messages: request.messages });
      const payload = payloads[Math.min(i, payloads.length - 1)];
      i++;
      return { success: true, tool_calls: [{ name: TOOL_NAME, input: payload }] };
    }),
  } as unknown as AiClient;
  return { pool, calls };
}

function run(pool: AiClient, supportedOperations: string[]) {
  return runCanvasSuggest({
    prompt: 'Mach den Text kürzer',
    snapshot: SNAPSHOT,
    capabilities: { supportedOperations },
    aiClient: pool,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('runCanvasSuggest', () => {
  it('drops operations this canvas does not support', async () => {
    const { pool } = poolReturning({
      suggestions: [{ id: 's1', title: 'Gemischt', operations: [setText, removeElement] }],
    });

    const result = await run(pool, ['set-text']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].operations).toHaveLength(1);
    expect(result.suggestions[0].operations[0].kind).toBe('set-text');
  });

  it('drops a suggestion left with no operations at all', async () => {
    const { pool } = poolReturning({
      suggestions: [suggestion(setText, 'keep'), suggestion(removeElement, 'drop')],
    });

    const result = await run(pool, ['set-text']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.map((s) => s.id)).toEqual(['keep']);
  });

  it('repairs once when nothing supported survives, naming the supported kinds', async () => {
    // First response is entirely unsupported; the repair turn returns a usable one.
    const { pool, calls } = poolReturning(
      { suggestions: [suggestion(removeElement)] },
      { suggestions: [suggestion(setText)] }
    );

    const result = await run(pool, ['set-text']);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    // The repair prompt must carry the reason — a blind retry of the identical
    // prompt is exactly what this replaced.
    const repairText = calls[1].messages.map((m) => m.content).join('\n');
    expect(repairText).toContain('set-text');
    expect(repairText).toMatch(/unterstützte Operation/i);
  });

  it('repairs exactly once on a schema violation, then gives up', async () => {
    const { pool, calls } = poolReturning({ suggestions: 'not-an-array' });

    const result = await run(pool, ['set-text']);

    expect(result.ok).toBe(false);
    // Two attempts total: the original plus one repair. Not more.
    expect(calls).toHaveLength(2);
  });

  it('surfaces the provider error rather than an empty success', async () => {
    const pool = {
      processRequest: vi.fn(async () => ({ success: false, error: 'upstream 503' })),
    } as unknown as AiClient;

    const result = await run(pool, ['set-text']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('upstream 503');
  });
});
