import { describe, expect, it } from 'vitest';

import { toWireToolCallId, withWireSafeToolCallIds, withWireToolCallIds } from '../toolCallIds.js';

import type { LanguageModel } from 'ai';

const WIRE = /^[a-zA-Z0-9]{9}$/;

/** Modell-Double auf Spezifikationsebene — das sieht die Middleware. */
function capturingModel(seen: { prompt?: unknown }): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async (params: { prompt: unknown }) => {
      seen.prompt = params.prompt;
      return {
        content: [{ type: 'text', text: 'ok' }],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
        warnings: [],
      };
    },
    doStream: async (params: { prompt: unknown }) => {
      seen.prompt = params.prompt;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'finish', usage: { inputTokens: 1, outputTokens: 1 } });
            controller.close();
          },
        }),
      };
    },
  } as unknown as LanguageModel;
}

describe('toWireToolCallId', () => {
  it('lässt gültige IDs unangetastet — die prägen die Modelle selbst', () => {
    expect(toWireToolCallId('abc123XYZ')).toBe('abc123XYZ');
    expect(toWireToolCallId('000000000')).toBe('000000000');
  });

  it('schreibt die persistierte Bauform um, die GreenPT mit 400 abwies', () => {
    // Gemeldet 24.08.2026: "Tool call id was 0540141_3 but must be a-z, A-Z,
    // 0-9, with a length of 9" — der Neun-Zeichen-Schwanz von tc_<ms>_<i>.
    const wire = toWireToolCallId('tc_1787000540141_3');
    expect(wire).toMatch(WIRE);
    expect(wire).not.toContain('_');
  });

  it('macht auch die Fremdanbieter- und Notnagel-IDs leitungsfähig', () => {
    for (const id of ['call_9dQx2mVb7pLk3RtY6sZw1nCf', 'forced-edit', 'mcp-notion__search', '']) {
      expect(toWireToolCallId(id)).toMatch(WIRE);
    }
  });

  it('ist deterministisch, damit Aufruf und Ergebnis zusammenfinden', () => {
    expect(toWireToolCallId('tc_1787000540141_3')).toBe(toWireToolCallId('tc_1787000540141_3'));
    expect(toWireToolCallId('tc_1787000540141_3')).not.toBe(toWireToolCallId('tc_1787000540141_4'));
  });
});

describe('withWireToolCallIds', () => {
  it('hält Aufruf und Ergebnis über Nachrichten hinweg gepaart', () => {
    const prompt = [
      { role: 'system', content: 'du bist ein Werkzeug' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc_1787000540141_3',
            toolName: 'web_search',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc_1787000540141_3',
            toolName: 'web_search',
            output: { type: 'text', value: 'x' },
          },
        ],
      },
    ];

    const out = withWireToolCallIds(prompt) as typeof prompt;
    const call = (out[1].content as Array<{ toolCallId: string }>)[0].toolCallId;
    const result = (out[2].content as Array<{ toolCallId: string }>)[0].toolCallId;

    expect(call).toMatch(WIRE);
    expect(result).toBe(call);
  });

  it('lässt Nachrichten ohne Werkzeug-Teile unverändert stehen', () => {
    const user = { role: 'user', content: [{ type: 'text', text: 'hallo' }] };
    const system = { role: 'system', content: 'prompt' };
    const out = withWireToolCallIds([system, user]);
    expect(out[0]).toBe(system);
    expect(out[1]).toBe(user);
  });

  it('kopiert nichts, wenn die IDs schon gültig sind', () => {
    const assistant = {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'abc123XYZ', toolName: 'x', input: {} }],
    };
    expect(withWireToolCallIds([assistant])[0]).toBe(assistant);
  });
});

describe('withWireSafeToolCallIds', () => {
  it('schreibt den Prompt um, bevor das Modell ihn sieht — blockierend', async () => {
    const seen: { prompt?: unknown } = {};
    const model = withWireSafeToolCallIds(capturingModel(seen));

    await (model as unknown as { doGenerate: (p: unknown) => Promise<unknown> }).doGenerate({
      prompt: [
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'tc_1787000540141_3', toolName: 'x', input: {} },
          ],
        },
      ],
    });

    const parts = (seen.prompt as Array<{ content: Array<{ toolCallId: string }> }>)[0].content;
    expect(parts[0].toolCallId).toMatch(WIRE);
  });

  it('schreibt den Prompt auch im Strom um', async () => {
    const seen: { prompt?: unknown } = {};
    const model = withWireSafeToolCallIds(capturingModel(seen));

    await (model as unknown as { doStream: (p: unknown) => Promise<unknown> }).doStream({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'forced-edit',
              toolName: 'edit_document',
              output: { type: 'text', value: 'ok' },
            },
          ],
        },
      ],
    });

    const parts = (seen.prompt as Array<{ content: Array<{ toolCallId: string }> }>)[0].content;
    expect(parts[0].toolCallId).toMatch(WIRE);
  });

  it('reicht einen blossen Modellbezeichner durch', () => {
    expect(withWireSafeToolCallIds('some-gateway-id' as unknown as LanguageModel)).toBe(
      'some-gateway-id'
    );
  });
});
