/**
 * generateStructured turns artifact generation from "prompt for JSON and hope"
 * into a forced tool call with a bounded repair retry.
 *
 * The behaviours that matter, and why:
 *  - the repair turn feeds the CONCRETE validation error back — a missing
 *    required field is what broke PDF generation in production, and a blind
 *    retry at the same temperature would just reproduce it;
 *  - the text fallback keeps providers that ignore tools working, so the new
 *    path is a strict superset of the old one and nothing can regress;
 *  - both transports run through ONE validator. They used to have separate
 *    ones, and the text path's returned a bare `null`: the PDF that died in
 *    production was rejected for `caption: null` and the repair turn was told
 *    "Kein Tool-Aufruf in der Antwort", so attempt 2 repeated the mistake. The
 *    same split let the presentation generator's empty-slide gate be skipped
 *    entirely whenever the provider answered with prose.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  generateStructured,
  jsonCandidatesFromText,
  type StructuredValidation,
} from './generateStructured.js';

import type { AiClient } from './types.js';

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
  pool: AiClient;
  processRequest: ReturnType<typeof vi.fn>;
} {
  const processRequest = vi.fn();
  for (const response of responses) processRequest.mockResolvedValueOnce(response);
  return { pool: { processRequest } as unknown as AiClient, processRequest };
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

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Fact Sheet' } });
    expect(processRequest).toHaveBeenCalledTimes(1);
  });

  it('forces the tool call rather than relying on the prompt', async () => {
    const { pool, processRequest } = poolReturning(toolCall({ title: 'X' }));

    await generateStructured({ ...base, aiClient: pool });

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

    const result = await generateStructured({ ...base, aiClient: pool });

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

  it('recovers JSON from text when the provider ignores tools', async () => {
    const { pool } = poolReturning({ success: true, content: '{"title":"Aus Text"}' });

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Aus Text' } });
  });

  it('runs the validator on the text transport, not just on the tool call', async () => {
    // The presentation empty-slide gate lived only in `validate`. A gate that a
    // provider can skip by answering with prose is not a gate.
    const gate = vi.fn(validate);
    const { pool } = poolReturning({
      success: true,
      content: 'Bitte sehr:\n```json\n{"title":"Aus Text"}\n```',
    });

    await generateStructured({ ...base, aiClient: pool, validate: gate });

    expect(gate).toHaveBeenCalledWith({ title: 'Aus Text' });
  });

  it('carries the validation error from a TEXT answer into the repair turn', async () => {
    const { pool, processRequest } = poolReturning(
      { success: true, content: '```json\n{"subtitle":"ohne Titel"}\n```' },
      toolCall({ title: 'Repariert' })
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Repariert' } });
    const [repair] = processRequest.mock.calls[1];
    const repairText = repair.messages.map((m: { content: string }) => m.content).join('\n');
    expect(repairText).toContain('title: Required');
    expect(repairText).not.toContain('Kein Tool-Aufruf');
    // The echo is the extracted STRUCTURE, not the prose around it.
    expect(
      repair.messages.some(
        (m: { role: string; content: string }) =>
          m.role === 'assistant' && m.content === '{"subtitle":"ohne Titel"}'
      )
    ).toBe(true);
  });

  it('does not treat unparseable text as success', async () => {
    const { pool, processRequest } = poolReturning(
      { success: true, content: 'nur Prosa' },
      { success: true, content: 'immer noch Prosa' }
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('kein verwertbares JSON');
    // Nothing parseable to echo — prose must not be replayed as if it were the
    // previous structure.
    const [repair] = processRequest.mock.calls[1];
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(false);
  });

  it('omits an oversized echo instead of truncating it mid-document', async () => {
    // The old code cut the echo at 2000 chars and then demanded a COMPLETE
    // document — so the model "corrected" the truncation.
    const { pool, processRequest } = poolReturning(
      toolCall({ filler: 'x'.repeat(20_000) }),
      toolCall({ title: 'Repariert' })
    );

    await generateStructured({ ...base, aiClient: pool });

    const [repair] = processRequest.mock.calls[1];
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(false);
    expect(repair.messages.at(-1).content).toContain('title: Required');
  });

  /**
   * The live failure: `doc_generation` ran under the generic 4096-token
   * default, a six-slide deck with a source matrix did not fit, and the lax
   * parser handed back the torso of the cut-off JSON. The log read "recovered
   * from text" — i.e. success — and the deck shipped with an empty last slide.
   * A structure whose answer was cut off is not a result.
   */
  it('rejects a CUT-OFF answer and retries, even though it parsed', async () => {
    const { pool, processRequest } = poolReturning(
      { ...toolCall({ title: 'Halb' }), stop_reason: 'length' },
      toolCall({ title: 'Ganz' })
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Ganz' } });
    expect(processRequest).toHaveBeenCalledTimes(2);
    // The repair names the CAUSE and echoes nothing: replaying the cut-off
    // draft would make the model "correct" the truncation (see MAX_ECHO_CHARS).
    const [repair] = processRequest.mock.calls[1];
    expect(repair.messages.at(-1).content).toContain('abgeschnitten');
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(false);
  });

  it('ships the torso when EVERY attempt was cut off', async () => {
    // Half a document the person can still finish beats none at all — the same
    // call createPdfDocument makes for its own repair round.
    const { pool } = poolReturning(
      { ...toolCall({ title: 'Torso A' }), stop_reason: 'length' },
      { ...toolCall({ title: 'Torso B' }), stop_reason: 'length' }
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Torso A' } });
  });

  /**
   * The live failure (board_generation, 06.08.2026): a forced tool call
   * (`tool_choice: 'required'`) got its argument JSON cut off. Some providers
   * still report a "tool call" finish reason for that — `tool_calls` ends up
   * empty (nothing to parse), there's no text to fall back to either, and the
   * old code read this as "no tool call, no JSON" instead of a truncation.
   */
  it('treats a forced tool call with no parseable result (stop_reason=tool_use) as truncation and retries', async () => {
    const { pool, processRequest } = poolReturning(
      { success: true, tool_calls: [], content: '', stop_reason: 'tool_use' },
      toolCall({ title: 'Ganz' })
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Ganz' } });
    expect(processRequest).toHaveBeenCalledTimes(2);
    const [repair] = processRequest.mock.calls[1];
    expect(repair.messages.at(-1).content).toContain('abgeschnitten');
  });

  it('does NOT treat prose the model wrote instead of calling the tool as truncation', async () => {
    // stop_reason is undefined/'stop' here — the model just ignored the tool
    // and wrote unrelated prose. A real rejection, not a cut-off tool call.
    const { pool } = poolReturning(
      { success: true, content: 'nur Prosa' },
      { success: true, content: 'immer noch Prosa' }
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('kein verwertbares JSON');
  });

  it('leaves the model choice to providerSelector', async () => {
    // A top-level `provider` picks the ADAPTER without picking a matching
    // model — routes/texte/website.ts documents where that lands. The creation
    // types route to Mistral Medium 3.5 by TYPE; see providerSelector.
    const { pool, processRequest } = poolReturning(toolCall({ title: 'X' }));

    await generateStructured({ ...base, aiClient: pool });

    const [request] = processRequest.mock.calls[0];
    expect(request.provider).toBeUndefined();
    expect(request.options.model).toBeUndefined();
  });

  it('gives up after the attempt budget and reports the last error', async () => {
    const { pool, processRequest } = poolReturning(toolCall({}), toolCall({}));

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: false, error: 'title: Required' });
    expect(processRequest).toHaveBeenCalledTimes(2);
  });

  it('honours a raised attempt budget', async () => {
    const { pool, processRequest } = poolReturning(
      toolCall({}),
      toolCall({}),
      toolCall({ title: 'Endlich' })
    );

    const result = await generateStructured({ ...base, aiClient: pool, attempts: 3 });

    expect(result).toEqual({ ok: true, data: { title: 'Endlich' } });
    expect(processRequest).toHaveBeenCalledTimes(3);
  });

  it('retries a provider error', async () => {
    const { pool } = poolReturning(
      { success: false, error: 'upstream 503' },
      toolCall({ title: 'Zweiter Versuch' })
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Zweiter Versuch' } });
  });

  it('survives a throwing provider without rejecting', async () => {
    const processRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(toolCall({ title: 'Nach dem Fehler' }));

    const result = await generateStructured({
      ...base,
      aiClient: { processRequest } as unknown as AiClient,
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

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'Aus Block' } });
  });

  it('extracts JSON from every shape a text answer takes', () => {
    expect(jsonCandidatesFromText('{"title":"A"}')).toEqual([{ title: 'A' }]);
    expect(jsonCandidatesFromText('Hier:\n```json\n{"title":"B"}\n```')).toContainEqual({
      title: 'B',
    });
    expect(jsonCandidatesFromText('Vorrede {"title":"C"} Nachrede')).toContainEqual({ title: 'C' });
    expect(jsonCandidatesFromText('Ich kann das leider nicht.')).toEqual([]);
  });

  it('ignores a tool call for a different tool', async () => {
    const { pool } = poolReturning(
      { success: true, tool_calls: [{ name: 'something_else', input: { title: 'falsch' } }] },
      toolCall({ title: 'richtig' })
    );

    const result = await generateStructured({ ...base, aiClient: pool });

    expect(result).toEqual({ ok: true, data: { title: 'richtig' } });
  });
});
