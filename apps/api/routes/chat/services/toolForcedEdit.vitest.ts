/**
 * The failure paths are the reason this driver is shared: the retry policy,
 * the two shapes a provider can return a tool call in, and the truncated
 * schema-mismatch report. Previously duplicated between sharepicEditLlm and
 * reelEditLlm, where they could drift apart unnoticed.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Attrappiert wird die Maschine, nicht der Client: der Treiber ruft `aiTools`,
// und das geht direkt auf `executeProvider`.
const executeProvider = vi.fn();
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { runToolForcedEdit } = await import('./toolForcedEdit.js');

const schema = z.object({ summary: z.string(), count: z.number() });

/** Primär der Lane `canvas_ai_suggest` (siehe `AI_LANES`) — der Beginn jedes Versuchs. */
const PRIMARY = 'mistral';

/**
 * Ein Eintrag je VERSUCH des Treibers, nicht je Provider-Aufruf.
 *
 * Ein `Error` lässt die ganze Ausfallkette dieses Versuchs scheitern — das ist,
 * was ein Provider-Fehler auf der Fassade bedeutet: erst wenn auch der letzte
 * Anbieter nichts liefert, wirft sie. Ein Versuch beginnt immer beim Primär,
 * daran werden sie gezählt.
 */
function attempts(outcomes: unknown[]) {
  executeProvider.mockReset();
  let index = -1;
  executeProvider.mockImplementation((provider: string) => {
    if (provider === PRIMARY) index += 1;
    const outcome = outcomes[Math.min(index, outcomes.length - 1)];
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  });
}

/** Wie oft der Treiber es versucht hat. */
function attemptCount(): number {
  return executeProvider.mock.calls.filter((c) => c[0] === PRIMARY).length;
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
    attempts([
      {
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: 'apply_edit', input: { summary: 'ok', count: 2 } }],
      },
    ]);

    const result = await runToolForcedEdit(base);

    expect(result).toEqual({ ok: true, edit: { summary: 'ok', count: 2 } });
    expect(attemptCount()).toBe(1);
    const envelope = executeProvider.mock.calls[0][2] as {
      options: { tool_choice: string; tools: Array<{ name: string }> };
    };
    expect(envelope.options.tool_choice).toBe('required');
    expect(envelope.options.tools[0].name).toBe('apply_edit');
  });

  it('also reads a tool call from raw_content_blocks', async () => {
    attempts([
      {
        success: true,
        stop_reason: 'tool_use',
        raw_content_blocks: [
          { type: 'text', text: 'hm' },
          { type: 'tool_use', name: 'apply_edit', input: { summary: 'ok', count: 1 } },
        ],
      },
    ]);

    await expect(runToolForcedEdit(base)).resolves.toEqual({
      ok: true,
      edit: { summary: 'ok', count: 1 },
    });
  });

  it('ignores a tool call for a different tool', async () => {
    attempts([
      {
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: 'something_else', input: { summary: 'x', count: 1 } }],
      },
    ]);

    const result = await runToolForcedEdit(base);
    expect(result).toEqual({ ok: false, error: 'No tool call in response' });
  });

  it('retries once after a provider error and succeeds', async () => {
    attempts([
      new Error('upstream 503'),
      {
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: 'apply_edit', input: { summary: 'ok', count: 3 } }],
      },
    ]);

    const result = await runToolForcedEdit(base);

    expect(result).toEqual({ ok: true, edit: { summary: 'ok', count: 3 } });
    expect(attemptCount()).toBe(2);
  });

  it('reports a schema mismatch after exhausting attempts', async () => {
    attempts([
      {
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: 'apply_edit', input: { summary: 42 } }],
      },
    ]);

    const result = await runToolForcedEdit(base);

    expect(attemptCount()).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Schema mismatch');
  });

  it('survives a thrown request and reports the message', async () => {
    attempts([new Error('boom')]);

    const result = await runToolForcedEdit(base);

    // Die Meldung ist die der Fassade und ZITIERT den letzten Anbieterfehler —
    // vorher war sie identisch mit ihm, weil `processRequest` ihn durchreichte.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('boom');
  });

  it('honours a custom maxAttempts', async () => {
    attempts([new Error('nope')]);

    await runToolForcedEdit({ ...base, maxAttempts: 3 });

    expect(attemptCount()).toBe(3);
  });
});
