/**
 * The failure paths are the reason this driver is shared: the retry policy,
 * the two shapes a provider can return a tool call in, and the truncated
 * schema-mismatch report. Previously duplicated between sharepicEditLlm and
 * reelEditLlm, where they could drift apart unnoticed.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { runToolForcedEdit } from './toolForcedEdit.js';

import type { AiClient } from '../../../services/ai/types.js';

const schema = z.object({ summary: z.string(), count: z.number() });

function makePool(results: unknown[]): {
  pool: AiClient;
  processRequest: ReturnType<typeof vi.fn>;
} {
  const processRequest = vi.fn();
  for (const r of results) {
    if (r instanceof Error) processRequest.mockRejectedValueOnce(r);
    else processRequest.mockResolvedValueOnce(r);
  }
  return { pool: { processRequest } as unknown as AiClient, processRequest };
}

const base = {
  toolName: 'apply_edit',
  description: 'Wendet eine Änderung an.',
  schema,
  systemPrompt: 'system',
  instruction: 'mach es kürzer',
  logPrefix: '[test_edit]',
};

describe('runToolForcedEdit', () => {
  it('returns the parsed edit from tool_calls', async () => {
    const { pool, processRequest } = makePool([
      { success: true, tool_calls: [{ name: 'apply_edit', input: { summary: 'ok', count: 2 } }] },
    ]);

    const result = await runToolForcedEdit({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, edit: { summary: 'ok', count: 2 } });
    expect(processRequest).toHaveBeenCalledTimes(1);
    const [request] = processRequest.mock.calls[0];
    expect(request.options.tool_choice).toBe('required');
    expect(request.options.tools[0].name).toBe('apply_edit');
  });

  it('also reads a tool call from raw_content_blocks', async () => {
    const { pool } = makePool([
      {
        success: true,
        raw_content_blocks: [
          { type: 'text', text: 'hm' },
          { type: 'tool_use', name: 'apply_edit', input: { summary: 'ok', count: 1 } },
        ],
      },
    ]);

    await expect(runToolForcedEdit({ ...base, aiClient: pool })).resolves.toEqual({
      ok: true,
      edit: { summary: 'ok', count: 1 },
    });
  });

  it('ignores a tool call for a different tool', async () => {
    const { pool } = makePool([
      {
        success: true,
        tool_calls: [{ name: 'something_else', input: { summary: 'x', count: 1 } }],
      },
      {
        success: true,
        tool_calls: [{ name: 'something_else', input: { summary: 'x', count: 1 } }],
      },
    ]);

    const result = await runToolForcedEdit({ ...base, aiClient: pool });
    expect(result).toEqual({ ok: false, error: 'No tool call in response' });
  });

  it('retries once after a provider error and succeeds', async () => {
    const { pool, processRequest } = makePool([
      { success: false, error: 'upstream 503' },
      { success: true, tool_calls: [{ name: 'apply_edit', input: { summary: 'ok', count: 3 } }] },
    ]);

    const result = await runToolForcedEdit({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, edit: { summary: 'ok', count: 3 } });
    expect(processRequest).toHaveBeenCalledTimes(2);
  });

  it('reports a schema mismatch after exhausting attempts', async () => {
    const bad = { success: true, tool_calls: [{ name: 'apply_edit', input: { summary: 42 } }] };
    const { pool, processRequest } = makePool([bad, bad]);

    const result = await runToolForcedEdit({ ...base, aiClient: pool });

    expect(processRequest).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Schema mismatch');
  });

  it('survives a thrown request and reports the message', async () => {
    const { pool } = makePool([new Error('boom'), new Error('boom')]);

    const result = await runToolForcedEdit({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('honours a custom maxAttempts', async () => {
    const bad = { success: false, error: 'nope' };
    const { pool, processRequest } = makePool([bad, bad, bad]);

    await runToolForcedEdit({ ...base, aiClient: pool, maxAttempts: 3 });

    expect(processRequest).toHaveBeenCalledTimes(3);
  });
});
