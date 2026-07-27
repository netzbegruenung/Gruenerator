/**
 * generateStructured turns artifact generation from "prompt for JSON and hope"
 * into a forced tool call with a bounded repair retry.
 *
 * The behaviours that matter, and why:
 *  - the repair turn feeds the CONCRETE validation error back — a missing
 *    required field is what broke PDF generation in production, and a blind
 *    retry at the same temperature would just reproduce it;
 *  - the text fallback keeps providers that ignore tools working, so the new
 *    path is a strict superset of the old one and nothing can regress.
 */

import { describe, expect, it, vi } from 'vitest';

import { generateStructured, type StructuredValidation } from './generateStructured.js';

import type { AIWorkerPool } from '../../workers/types.js';

const TOOL = 'create_thing';

interface Thing {
  title: string;
}

/** Accepts only an object with a non-empty title; reports the missing path. */
const validate = (input: unknown): StructuredValidation<Thing> => {
  const obj = input as { title?: unknown };
  if (typeof obj?.title === 'string' && obj.title.length > 0) {
    return { ok: true, value: { title: obj.title } };
  }
  return { ok: false, error: 'title: Required' };
};

const toolCall = (input: Record<string, unknown>) => ({
  success: true,
  tool_calls: [{ name: TOOL, input }],
});

function poolReturning(...responses: unknown[]): {
  pool: AIWorkerPool;
  processRequest: ReturnType<typeof vi.fn>;
} {
  const processRequest = vi.fn();
  for (const response of responses) processRequest.mockResolvedValueOnce(response);
  return { pool: { processRequest } as unknown as AIWorkerPool, processRequest };
}

const base = {
  type: 'doc_generation',
  systemPrompt: 'Du bist ein Assistent.',
  userContent: 'Mach ein Fact Sheet.',
  toolName: TOOL,
  toolDescription: 'Erzeugt ein Ding.',
  schema: { type: 'object', required: ['title'] },
  validate,
  label: 'test',
};

describe('generateStructured', () => {
  it('returns the validated tool call on the first attempt', async () => {
    const { pool, processRequest } = poolReturning(toolCall({ title: 'Fact Sheet' }));

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Fact Sheet' } });
    expect(processRequest).toHaveBeenCalledTimes(1);
  });

  it('forces the tool call rather than relying on the prompt', async () => {
    const { pool, processRequest } = poolReturning(toolCall({ title: 'X' }));

    await generateStructured({ ...base, aiWorkerPool: pool });

    const [request] = processRequest.mock.calls[0];
    expect(request.options.tool_choice).toBe('required');
    expect(request.options.tools).toHaveLength(1);
    expect(request.options.tools[0].name).toBe(TOOL);
  });

  it('repairs an invalid first answer by feeding the error back', async () => {
    const { pool, processRequest } = poolReturning(
      toolCall({ subtitle: 'ohne Titel' }),
      toolCall({ title: 'Repariert' })
    );

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Repariert' } });
    expect(processRequest).toHaveBeenCalledTimes(2);

    const [repair] = processRequest.mock.calls[1];
    const repairText = repair.messages.map((m: { content: string }) => m.content).join('\n');
    // The concrete failing path must reach the model — that is what fixes it.
    expect(repairText).toContain('title: Required');
    expect(repairText).toContain(TOOL);
    // The rejected output is replayed so the model corrects rather than restarts.
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(true);
    // Creativity already failed once.
    expect(repair.options.temperature).toBe(0);
  });

  it('falls back to the text parser when the provider ignores tools', async () => {
    const { pool } = poolReturning({ success: true, content: '{"title":"Aus Text"}' });
    const parseText = vi.fn((text: string) => JSON.parse(text) as Thing);

    const result = await generateStructured({ ...base, aiWorkerPool: pool, parseText });

    expect(result).toEqual({ ok: true, data: { title: 'Aus Text' } });
    expect(parseText).toHaveBeenCalledWith('{"title":"Aus Text"}');
  });

  it('does not treat unparseable text as success', async () => {
    const { pool } = poolReturning(
      { success: true, content: 'nur Prosa' },
      { success: true, content: 'immer noch Prosa' }
    );

    const result = await generateStructured({
      ...base,
      aiWorkerPool: pool,
      parseText: () => null,
    });

    expect(result.ok).toBe(false);
  });

  it('gives up after the attempt budget and reports the last error', async () => {
    const { pool, processRequest } = poolReturning(toolCall({}), toolCall({}));

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: false, error: 'title: Required' });
    expect(processRequest).toHaveBeenCalledTimes(2);
  });

  it('honours a raised attempt budget', async () => {
    const { pool, processRequest } = poolReturning(
      toolCall({}),
      toolCall({}),
      toolCall({ title: 'Endlich' })
    );

    const result = await generateStructured({ ...base, aiWorkerPool: pool, attempts: 3 });

    expect(result).toEqual({ ok: true, data: { title: 'Endlich' } });
    expect(processRequest).toHaveBeenCalledTimes(3);
  });

  it('retries a provider error', async () => {
    const { pool } = poolReturning(
      { success: false, error: 'upstream 503' },
      toolCall({ title: 'Zweiter Versuch' })
    );

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Zweiter Versuch' } });
  });

  it('survives a throwing provider without rejecting', async () => {
    const processRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(toolCall({ title: 'Nach dem Fehler' }));

    const result = await generateStructured({
      ...base,
      aiWorkerPool: { processRequest } as unknown as AIWorkerPool,
    });

    expect(result).toEqual({ ok: true, data: { title: 'Nach dem Fehler' } });
  });

  it('reads the tool call out of raw content blocks too', async () => {
    const { pool } = poolReturning({
      success: true,
      raw_content_blocks: [
        { type: 'text', text: 'Ich baue das jetzt.' },
        { type: 'tool_use', name: TOOL, input: { title: 'Aus Block' } },
      ],
    });

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Aus Block' } });
  });

  it('ignores a tool call for a different tool', async () => {
    const { pool } = poolReturning(
      { success: true, tool_calls: [{ name: 'something_else', input: { title: 'falsch' } }] },
      toolCall({ title: 'richtig' })
    );

    const result = await generateStructured({ ...base, aiWorkerPool: pool });

    expect(result).toEqual({ ok: true, data: { title: 'richtig' } });
  });
});
