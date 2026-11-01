import { describe, expect, it } from 'vitest';

import { contentAsToolCall, forcedToolAsJsonSchema } from '../forcedToolJsonSchema.js';

const MODELS = new Set(['m']);
const schema = { type: 'object', properties: { a: { type: 'string' } } };

function forcedBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
    tools: [{ type: 'function', function: { name: 'melden', parameters: schema } }],
    tool_choice: 'required',
    ...extra,
  };
}

function completion(content: unknown, finish = 'stop'): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content }, finish_reason: finish }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

interface Parsed {
  choices: {
    message: { content: unknown; tool_calls?: { id: string; function: unknown }[] };
    finish_reason: string;
  }[];
}

describe('forcedToolAsJsonSchema', () => {
  it('schreibt ein erzwungenes Einzelwerkzeug um', () => {
    const body = forcedBody();
    expect(forcedToolAsJsonSchema(body, MODELS)).toBe('melden');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'melden', schema },
    });
    expect(body).not.toHaveProperty('tools');
  });

  it("lässt tool_choice 'auto' unberührt", () => {
    const body = forcedBody({ tool_choice: 'auto' });
    expect(forcedToolAsJsonSchema(body, MODELS)).toBeNull();
    expect(body.tool_choice).toBe('auto');
  });

  it('lässt einen gestreamten Zug unberührt', () => {
    const body = forcedBody({ stream: true });
    expect(forcedToolAsJsonSchema(body, MODELS)).toBeNull();
    expect(body).toHaveProperty('tools');
  });

  it('lässt ein Werkzeug mit parameters: null unberührt', () => {
    const body = forcedBody({
      tools: [{ type: 'function', function: { name: 'melden', parameters: null } }],
    });
    expect(forcedToolAsJsonSchema(body, MODELS)).toBeNull();
    expect(body).not.toHaveProperty('response_format');
  });
});

describe('contentAsToolCall', () => {
  it('legt JSON-Inhalt als Werkzeugaufruf zurück, mit UUID-Kennung', async () => {
    const json = (await (
      await contentAsToolCall(completion('{"a":"x"}'), 'melden')
    ).json()) as Parsed;
    const choice = json.choices[0];
    expect(choice.message.content).toBeNull();
    expect(choice.message.tool_calls?.[0].function).toEqual({
      name: 'melden',
      arguments: '{"a":"x"}',
    });
    expect(choice.message.tool_calls?.[0].id).toMatch(/^call_[0-9a-f-]{36}$/);
    expect(choice.finish_reason).toBe('tool_calls');
  });

  // Kein JSON-Objekt: der Text bleibt, damit die Text-Rückgewinnung von `aiObject` ihn sieht.
  it('lässt Fliesstext unverändert', async () => {
    const json = (await (
      await contentAsToolCall(completion('Hier: {"a":"x"}'), 'melden')
    ).json()) as Parsed;
    expect(json.choices[0].message.content).toBe('Hier: {"a":"x"}');
    expect(json.choices[0].message.tool_calls).toBeUndefined();
    expect(json.choices[0].finish_reason).toBe('stop');
  });

  it('lässt abgeschnittenes JSON unverändert', async () => {
    const json = (await (
      await contentAsToolCall(completion('{"a":"x', 'length'), 'melden')
    ).json()) as Parsed;
    expect(json.choices[0].message.content).toBe('{"a":"x');
    expect(json.choices[0].finish_reason).toBe('length');
  });

  it('lässt ein JSON-Array oder eine Zahl unverändert', async () => {
    for (const content of ['[1,2]', '42']) {
      const json = (await (
        await contentAsToolCall(completion(content), 'melden')
      ).json()) as Parsed;
      expect(json.choices[0].message.content).toBe(content);
    }
  });

  it('reicht leeren Inhalt unverändert durch', async () => {
    const json = (await (await contentAsToolCall(completion(''), 'melden')).json()) as Parsed;
    expect(json.choices[0].message.content).toBe('');
    expect(json.choices[0].message.tool_calls).toBeUndefined();
  });
});
