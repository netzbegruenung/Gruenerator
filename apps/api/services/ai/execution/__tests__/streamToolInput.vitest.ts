/**
 * Streaming a forced tool call so a UI can fill in while the model writes.
 *
 * `execute` streams only when the request carries `onToolInputText`; the result
 * it returns must be the same `AiResult` the generate path builds, because the
 * fallback chain, validation and repair turn above it are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../providers.js', () => ({
  getModel: vi.fn(() => ({ modelId: 'm' })),
  isProviderConfigured: vi.fn(() => true),
  getDefaultModel: vi.fn(() => 'gemma-4-31b:eco'),
}));
vi.mock('../../../tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute } = await import('../execute.js');
type Deps = NonNullable<Parameters<typeof execute>[3]>;

const request = { type: 'website', messages: [{ role: 'user' as const, content: 'Lena' }] };

const toolCall = {
  toolCallId: 'call_1',
  toolName: 'create_site_content',
  input: { hero: { heading: 'Lena Hoffmann' } },
};

function fakeStream(parts: unknown[]) {
  return vi.fn(() => ({
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
    text: Promise.resolve(''),
    finishReason: Promise.resolve('tool-calls'),
    toolCalls: Promise.resolve([toolCall]),
    usage: Promise.resolve({ inputTokens: 700, outputTokens: 500, totalTokens: 1200 }),
  }));
}

const generateText = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('execute with onToolInputText', () => {
  it('reports the arguments written so far and returns the same result shape', async () => {
    const streamText = fakeStream([
      { type: 'tool-input-start', id: 'call_1', toolName: 'create_site_content' },
      { type: 'tool-input-delta', id: 'call_1', delta: '{"hero":{"head' },
      { type: 'tool-input-delta', id: 'call_1', delta: 'ing":"Lena' },
      { type: 'tool-input-end', id: 'call_1' },
    ]);
    const seen: string[] = [];

    const result = await execute(
      'melious',
      'req',
      { ...request, onToolInputText: (text: string) => seen.push(text) },
      { generateText, streamText } as unknown as Deps
    );

    expect(seen).toEqual(['{"hero":{"head', '{"hero":{"heading":"Lena']);
    expect(generateText).not.toHaveBeenCalled();
    expect(result.stop_reason).toBe('tool_use');
    expect(result.tool_calls).toEqual([
      { id: 'call_1', name: 'create_site_content', input: toolCall.input },
    ]);
    expect(result.metadata?.usage?.total_tokens).toBe(1200);
  });

  it('starts over when a second tool call begins', async () => {
    const streamText = fakeStream([
      { type: 'tool-input-start', id: 'a', toolName: 'x' },
      { type: 'tool-input-delta', id: 'a', delta: '{"a":1' },
      { type: 'tool-input-start', id: 'b', toolName: 'x' },
      { type: 'tool-input-delta', id: 'b', delta: '{"b"' },
    ]);
    const seen: string[] = [];

    await execute(
      'melious',
      'req',
      { ...request, onToolInputText: (text: string) => seen.push(text) },
      { generateText, streamText } as unknown as Deps
    );

    expect(seen).toEqual(['{"a":1', '{"b"']);
  });

  it('throws a provider error that arrives inside the stream', async () => {
    const streamText = fakeStream([{ type: 'error', error: new Error('503 server_error') }]);

    await expect(
      execute('melious', 'req', { ...request, onToolInputText: () => {} }, {
        generateText,
        streamText,
      } as unknown as Deps)
    ).rejects.toThrow('503 server_error');
  });

  it('keeps generating when the listener throws', async () => {
    const streamText = fakeStream([
      { type: 'tool-input-start', id: 'c', toolName: 'x' },
      { type: 'tool-input-delta', id: 'c', delta: '{' },
    ]);

    const result = await execute(
      'melious',
      'req',
      {
        ...request,
        onToolInputText: () => {
          throw new Error('listener broke');
        },
      },
      { generateText, streamText } as unknown as Deps
    );

    expect(result.stop_reason).toBe('tool_use');
  });
});

describe('execute without onToolInputText', () => {
  it('generates as before and never streams', async () => {
    const streamText = fakeStream([]);
    generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });

    const result = await execute('melious', 'req', request, {
      generateText,
      streamText,
    } as unknown as Deps);

    expect(streamText).not.toHaveBeenCalled();
    expect(result.content).toBe('Antwort');
  });
});
