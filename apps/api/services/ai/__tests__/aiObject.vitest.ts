/**
 * `aiObject` turns artifact generation from "prompt for JSON and hope" into a
 * forced tool call with a bounded repair retry. It is the merged form of what
 * used to be two entries — the facade's `aiObject` and `generateStructured` —
 * and these are the behaviours the production callers depend on:
 *
 *  - the repair turn feeds the CONCRETE validation error back — a missing
 *    required field is what broke PDF generation in production, and a blind
 *    retry at the same temperature would just reproduce it;
 *  - the text fallback keeps providers that ignore tools working, so this path
 *    is a strict superset of the prompt-and-parse it replaced;
 *  - both transports run through ONE validator. They used to have separate
 *    ones, and the text path's returned a bare `null`: the PDF that died in
 *    production was rejected for `caption: null` and the repair turn was told
 *    "Kein Tool-Aufruf in der Antwort", so attempt 2 repeated the mistake. The
 *    same split let the presentation generator's empty-slide gate be skipped
 *    entirely whenever the provider answered with prose.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();

vi.mock('../execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { aiObject } = await import('../generate.js');

import type { StructuredValidation } from '../structuredParsing.js';

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
  content: null,
  success: true,
  stop_reason: 'tool_use',
  tool_calls: [{ name: TOOL, input }],
});

/** One response per ATTEMPT: each of these answers on the lane's primary, so
 *  the fallback chain never gets a turn and attempt N is call N. */
function answering(...responses: unknown[]) {
  executeProvider.mockReset();
  for (const response of responses) executeProvider.mockResolvedValueOnce(response);
  return executeProvider;
}

/** The request envelope of attempt `i`. */
function requestAt(i: number) {
  return (executeProvider.mock.calls[i] as [string, string, Record<string, any>])[2];
}

const base = {
  lane: 'doc_generation' as const,
  system: 'Du bist ein Assistent.',
  prompt: 'Mach ein Fact Sheet.',
  toolName: TOOL,
  toolDescription: 'Erzeugt ein Ding.',
  schema: { type: 'object', required: ['title'] },
  validate,
  label: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aiObject', () => {
  it('returns the validated tool call on the first attempt', async () => {
    answering(toolCall({ title: 'Fact Sheet' }));

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Fact Sheet' } });
    expect(executeProvider).toHaveBeenCalledTimes(1);
  });

  it('forces the tool call rather than relying on the prompt', async () => {
    answering(toolCall({ title: 'X' }));

    await aiObject(base);

    expect(requestAt(0).options.tool_choice).toBe('required');
    expect(requestAt(0).options.tools).toHaveLength(1);
    expect(requestAt(0).options.tools[0].name).toBe(TOOL);
  });

  it('routes through the lane registry instead of leaving the model open', async () => {
    // `generateStructured` set no provider and no model and left both to
    // `providerSelector`. The lane table is that decision, written down:
    // `doc_generation` is Gemma 4 on GreenPT because Medium 3.5 does not call
    // the tool here (ARTIFACT_MODEL in providerSelector.ts).
    answering(toolCall({ title: 'X' }));

    await aiObject(base);

    expect(executeProvider.mock.calls[0][0]).toBe('greenpt');
    expect(requestAt(0).options.model).toBe('gemma4');
    expect(requestAt(0).type).toBe('doc_generation');
  });

  it('repairs an invalid first answer by feeding the error back', async () => {
    answering(toolCall({ subtitle: 'ohne Titel' }), toolCall({ title: 'Repariert' }));

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Repariert' } });
    expect(executeProvider).toHaveBeenCalledTimes(2);

    const repair = requestAt(1);
    const repairText = repair.messages.map((m: { content: string }) => m.content).join('\n');
    // The concrete failing path must reach the model — that is what fixes it.
    expect(repairText).toContain('title: Required');
    expect(repairText).toContain(TOOL);
    // The rejected output is replayed so the model corrects rather than restarts.
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(true);
    // Creativity already failed once.
    expect(repair.options.temperature).toBe(0);
  });

  it('runs the repair at temperature 0 even when the caller named one', async () => {
    // The temperature has to travel on the CALL, not in the option bag: the bag
    // is spread first and a caller-set temperature would win over it.
    answering(toolCall({}), toolCall({ title: 'Repariert' }));

    await aiObject({ ...base, temperature: 0.7 });

    expect(requestAt(0).options.temperature).toBe(0.7);
    expect(requestAt(1).options.temperature).toBe(0);
  });

  it('recovers JSON from text when the provider ignores tools', async () => {
    answering({ success: true, content: '{"title":"Aus Text"}' });

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Aus Text' } });
  });

  it('runs the validator on the text transport, not just on the tool call', async () => {
    // The presentation empty-slide gate lived only in `validate`. A gate that a
    // provider can skip by answering with prose is not a gate.
    const gate = vi.fn(validate);
    answering({ success: true, content: 'Bitte sehr:\n```json\n{"title":"Aus Text"}\n```' });

    await aiObject({ ...base, validate: gate });

    expect(gate).toHaveBeenCalledWith({ title: 'Aus Text' });
  });

  it('carries the validation error from a TEXT answer into the repair turn', async () => {
    answering(
      { success: true, content: '```json\n{"subtitle":"ohne Titel"}\n```' },
      toolCall({ title: 'Repariert' })
    );

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Repariert' } });
    const repair = requestAt(1);
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
    answering(
      { success: true, content: 'nur Prosa' },
      { success: true, content: 'immer noch Prosa' }
    );

    const result = await aiObject(base);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('kein verwertbares JSON');
    // Nothing parseable to echo — prose must not be replayed as if it were the
    // previous structure.
    expect(requestAt(1).messages.some((m: { role: string }) => m.role === 'assistant')).toBe(false);
  });

  it('omits an oversized echo instead of truncating it mid-document', async () => {
    // The old code cut the echo at 2000 chars and then demanded a COMPLETE
    // document — so the model "corrected" the truncation.
    answering(toolCall({ filler: 'x'.repeat(20_000) }), toolCall({ title: 'Repariert' }));

    await aiObject(base);

    const repair = requestAt(1);
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
    // The cut-off answer arrives on the TEXT transport: a provider that runs
    // out of budget mid-tool-call sends no parseable arguments and no content,
    // which the chain treats as "did not answer" one level down.
    answering(
      { success: true, content: '{"title":"Halb"}', stop_reason: 'length' },
      toolCall({ title: 'Ganz' })
    );

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Ganz' } });
    expect(executeProvider).toHaveBeenCalledTimes(2);
    // The repair names the CAUSE and echoes nothing: replaying the cut-off
    // draft would make the model "correct" the truncation (see MAX_ECHO_CHARS).
    const repair = requestAt(1);
    expect(repair.messages.at(-1).content).toContain('abgeschnitten');
    expect(repair.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(false);
  });

  it('ships the torso when EVERY attempt was cut off', async () => {
    // Half a document the person can still finish beats none at all — the same
    // call createPdfDocument makes for its own repair round.
    answering(
      { success: true, content: '{"title":"Torso A"}', stop_reason: 'length' },
      { success: true, content: '{"title":"Torso B"}', stop_reason: 'length' }
    );

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Torso A' } });
  });

  /**
   * The live failure (board_generation, 06.08.2026): a forced tool call
   * (`tool_choice: 'required'`) got its argument JSON cut off. Some providers
   * still report a "tool call" finish reason for that — `tool_calls` ends up
   * empty (nothing to parse), there's no text to fall back to either, and the
   * old code read this as "no tool call, no JSON" instead of a truncation.
   */
  it('treats a forced tool call with no parseable result as truncation and retries', async () => {
    answering(
      { success: true, tool_calls: [], content: '', stop_reason: 'tool_use' },
      toolCall({ title: 'Ganz' })
    );

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Ganz' } });
    expect(executeProvider).toHaveBeenCalledTimes(2);
    expect(requestAt(1).messages.at(-1).content).toContain('abgeschnitten');
  });

  it('does NOT treat prose the model wrote instead of calling the tool as truncation', async () => {
    // stop_reason is undefined/'stop' here — the model just ignored the tool
    // and wrote unrelated prose. A real rejection, not a cut-off tool call.
    answering(
      { success: true, content: 'nur Prosa' },
      { success: true, content: 'immer noch Prosa' }
    );

    const result = await aiObject(base);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('kein verwertbares JSON');
  });

  it('gives up after the attempt budget and reports the last error', async () => {
    answering(toolCall({}), toolCall({}));

    const result = await aiObject(base);

    expect(result).toEqual({ ok: false, error: 'title: Required' });
    expect(executeProvider).toHaveBeenCalledTimes(2);
  });

  it('honours a raised attempt budget', async () => {
    answering(toolCall({}), toolCall({}), toolCall({ title: 'Endlich' }));

    const result = await aiObject({ ...base, attempts: 3 });

    expect(result).toEqual({ ok: true, data: { title: 'Endlich' } });
    expect(executeProvider).toHaveBeenCalledTimes(3);
  });

  it('survives an exhausted provider chain and tries again', async () => {
    // `runWithFallback` THROWS where `processRequest` answered `{success:false}`.
    // A second attempt may still find a provider that has recovered, so the
    // attempt loop must catch rather than reject.
    executeProvider.mockReset();
    executeProvider
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(toolCall({ title: 'Nach dem Fehler' }));

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Nach dem Fehler' } });
  });

  it('reads the tool call out of raw content blocks too', async () => {
    answering({
      success: true,
      stop_reason: 'tool_use',
      raw_content_blocks: [
        { type: 'text', text: 'Ich baue das jetzt.' },
        { type: 'tool_use', name: TOOL, input: { title: 'Aus Block' } },
      ],
    });

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'Aus Block' } });
  });

  it('ignores a tool call for a different tool', async () => {
    // Another tool's arguments are a wrong answer, not a result: handing them
    // to `validate` would check an object against the wrong schema.
    answering(
      {
        success: true,
        stop_reason: 'tool_use',
        tool_calls: [{ name: 'something_else', input: { title: 'falsch' } }],
      },
      toolCall({ title: 'richtig' })
    );

    const result = await aiObject(base);

    expect(result).toEqual({ ok: true, data: { title: 'richtig' } });
  });
});
