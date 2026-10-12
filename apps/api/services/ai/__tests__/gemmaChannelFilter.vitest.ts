import { simulateReadableStream, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createGemmaChannelFilter,
  GemmaChannelLoopError,
  stripGemmaChannels,
  withGemmaChannelFilter,
} from '../gemmaChannelFilter.js';
import { createToolCallTextFilter, parseTextToolCall } from '../gemmaToolCallText.js';

/** Feed `deltas` one by one, as a stream would. */
function run(deltas: string[]): string {
  const filter = createGemmaChannelFilter();
  return deltas.map((d) => filter.push(d)).join('') + filter.flush();
}

describe('createGemmaChannelFilter', () => {
  it('drops an empty thought channel before the answer', () => {
    expect(run(['<|channel>thought\n<channel|>', 'Hallo!'])).toBe('Hallo!');
  });

  it('drops the thought text inside a channel', () => {
    expect(stripGemmaChannels('<|channel>thought\nIch überlege.<channel|>Antwort')).toBe('Antwort');
  });

  it('reassembles markers split across deltas', () => {
    const raw = '<|channel>thought\n<channel|>Werde Mitglied!';
    const chars = [...raw];
    expect(run(chars)).toBe('Werde Mitglied!');
  });

  it('passes text without markers through unchanged, including a lone "<"', () => {
    expect(run(['a < b', ' und <|c', 'hannel ist kein Marker'])).toBe(
      'a < b und <|channel ist kein Marker'
    );
  });

  it('drops an unclosed channel at the end', () => {
    expect(run(['Text', '<|channel>thought\nabgebrochen'])).toBe('Text');
  });

  it('throws once the channels repeat (live 11.10.2026)', () => {
    const filter = createGemmaChannelFilter();
    const loop = '<|channel>thought <channel|>';
    expect(() => {
      for (let i = 0; i < 10; i++) filter.push(loop);
    }).toThrow(GemmaChannelLoopError);
  });
});

describe('withGemmaChannelFilter', () => {
  function model(deltas: string[]) {
    return new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't' },
            ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
            { type: 'text-end' as const, id: 't' },
            {
              type: 'finish' as const,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      }),
    });
  }

  it('strips the markers from streamed text', async () => {
    const result = streamText({
      model: withGemmaChannelFilter(model(['<|chan', 'nel>thought\n<chan', 'nel|>', 'Hallo!'])),
      prompt: 'x',
    });
    expect(await result.text).toBe('Hallo!');
  });

  it('errors the stream on a channel loop instead of streaming nothing forever', async () => {
    const result = streamText({
      model: withGemmaChannelFilter(model(Array(20).fill('<|channel>thought <channel|>'))),
      prompt: 'x',
    });
    const parts: string[] = [];
    for await (const part of result.stream) parts.push(part.type);
    expect(parts).toContain('error');
    expect(parts).not.toContain('text-delta');
  });
});

describe('Gemma tool call typed as text', () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  function textModel(deltas: string[]) {
    return new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't' },
            ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
            { type: 'text-end' as const, id: 't' },
            {
              type: 'finish' as const,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
              usage,
            },
          ],
        }),
      }),
    });
  }
  const call =
    '<|tool_call>call:edit_current_sharepic{instruction: "Kürze: \'Gute Schulen\', ok"}<tool_call|>';
  const edit = tool({
    description: 'edit',
    inputSchema: z.object({ instruction: z.string() }),
    execute: async ({ instruction }) => ({ ok: true, instruction }),
  });

  it('runs the call and keeps the markers out of the text (screenshot 13.10.2026)', async () => {
    const raw = [...call];
    const result = streamText({
      model: withGemmaChannelFilter(textModel(raw)),
      tools: { edit_current_sharepic: edit },
      prompt: 'x',
      stopWhen: stepCountIs(1),
    });
    const calls: unknown[] = [];
    for await (const part of result.stream) {
      if (part.type === 'tool-result') calls.push(part.output);
    }
    expect(calls).toEqual([{ ok: true, instruction: "Kürze: 'Gute Schulen', ok" }]);
    expect(await result.text).toBe('');
  });

  it('reads the native <|"|> string delimiters', () => {
    expect(
      parseTextToolCall('call:edit_current_sharepic{instruction:<|"|>Kürzer, "ja"<|"|>,n:2}')
    ).toEqual({ toolName: 'edit_current_sharepic', input: { instruction: 'Kürzer, "ja"', n: 2 } });
  });

  it('drops a call to a tool that is not mounted, and keeps the prose around it', async () => {
    const result = streamText({
      model: withGemmaChannelFilter(
        textModel(['Okay. ', '<|tool_call>call:nope{a:1}<tool_call|>', 'Fertig.'])
      ),
      tools: { edit_current_sharepic: edit },
      prompt: 'x',
    });
    expect(await result.text).toBe('Okay. Fertig.');
  });

  it('drops an unparsable or unclosed call without leaking markers', () => {
    const filter = createToolCallTextFilter();
    const a = filter.push('A <|tool_call>call:x{broken<tool_call|> B <|tool_call>call:y{');
    expect(a.text).toBe('A  B ');
    expect(a.calls).toEqual([]);
    expect(filter.flush()).toBe('');
  });
});
