import { type UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { documentOperationTypes, sanitizeDocumentOperations } =
  await import('./sanitizeDocumentOperations.js');

const TOOL = 'applyDocumentOperations';
const TYPES = new Set(['add', 'update', 'delete']);

async function run(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const source = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const out: UIMessageChunk[] = [];
  const reader = source.pipeThrough(sanitizeDocumentOperations(TYPES)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

function streamedCall(id: string, deltas: string[], input: unknown): UIMessageChunk[] {
  return [
    { type: 'tool-input-start', toolCallId: id, toolName: TOOL },
    ...deltas.map((d): UIMessageChunk => ({
      type: 'tool-input-delta',
      toolCallId: id,
      inputTextDelta: d,
    })),
    { type: 'tool-input-available', toolCallId: id, toolName: TOOL, input },
  ];
}

function streamedText(chunks: UIMessageChunk[], id: string): string {
  return chunks
    .map((c) => (c.type === 'tool-input-delta' && c.toolCallId === id ? c.inputTextDelta : ''))
    .join('');
}

/** Splits text into deltas of `size` characters, like a provider streaming tokens. */
function split(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const frame: UIMessageChunk[] = [{ type: 'start' }, { type: 'start-step' }];
const end: UIMessageChunk[] = [{ type: 'finish-step' }, { type: 'finish' }];

describe('sanitizeDocumentOperations', () => {
  it('passes a valid call through with the same text and input', async () => {
    const input = { operations: [{ type: 'delete', id: 'a$' }] };
    const deltas = ['{"operations":', '[{"type":"del', 'ete","id":"a$"}]}'];
    const out = await run([...frame, ...streamedCall('c1', deltas, input), ...end]);
    expect(streamedText(out, 'c1')).toBe(deltas.join(''));
    expect(out.map((c) => c.type)).toEqual([
      'start',
      'start-step',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-available',
      'finish-step',
      'finish',
    ]);
    expect(out[4]).toEqual({
      type: 'tool-input-available',
      toolCallId: 'c1',
      toolName: TOOL,
      input,
    });
  });

  it('drops a streamed call whose operations stay empty', async () => {
    const chunks = [
      ...frame,
      ...streamedCall('c1', ['{"operations":', '[]}'], { operations: [] }),
      ...end,
    ];
    expect(await run(chunks)).toEqual([...frame, ...end]);
  });

  it('drops a non-streamed call without operations', async () => {
    const chunks: UIMessageChunk[] = [
      ...frame,
      { type: 'tool-input-available', toolCallId: 'c1', toolName: TOOL, input: {} },
      ...end,
    ];
    expect(await run(chunks)).toEqual([...frame, ...end]);
  });

  it('keeps a valid call next to a dropped one', async () => {
    const valid = streamedCall('c2', ['{"operations":[{"type":"delete","id":"b$"}]}'], {
      operations: [{ type: 'delete', id: 'b$' }],
    });
    const chunks = [
      ...frame,
      ...streamedCall('c1', ['{"operations":[]}'], { operations: [] }),
      ...valid,
      ...end,
    ];
    expect(await run(chunks)).toEqual([...frame, ...valid, ...end]);
  });

  it('drops an unfinished call that never showed an operation', async () => {
    const start: UIMessageChunk = { type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL };
    const delta: UIMessageChunk = {
      type: 'tool-input-delta',
      toolCallId: 'c1',
      inputTextDelta: '{"operations":[',
    };
    const error: UIMessageChunk = { type: 'error', errorText: 'provider down' };
    expect(await run([...frame, start, delta, error])).toEqual([...frame, error]);
  });

  it('forwards a valid operation cut off mid-stream ahead of the error', async () => {
    const error: UIMessageChunk = { type: 'error', errorText: 'provider down' };
    const out = await run([
      ...frame,
      { type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL },
      {
        type: 'tool-input-delta',
        toolCallId: 'c1',
        inputTextDelta: '{"operations":[{"type":"add","blocks":["Hal',
      },
      error,
    ]);
    expect(streamedText(out, 'c1')).toBe('{"operations":[{"type":"add","blocks":["Hal');
    expect(out.at(-1)).toEqual(error);
  });

  it('leaves other tools and text untouched', async () => {
    const chunks: UIMessageChunk[] = [
      ...frame,
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hallo' },
      { type: 'text-end', id: 't1' },
      { type: 'tool-input-available', toolCallId: 'x', toolName: 'other', input: {} },
      ...end,
    ];
    expect(await run(chunks)).toEqual(chunks);
  });

  describe('operations BlockNote would reject (GlitchTip #681)', () => {
    const add = {
      type: 'add',
      referenceId: 'a$',
      position: 'after',
      blocks: ['Neu, [mit] {Klammern}'],
    };
    const update = { type: 'update', id: 'b$', block: 'Text mit \\"Zitat\\"' };
    const typeless = { id: 'c$', block: 'ohne Typ' };
    const unknown = { type: 'replace', id: 'd$' };

    for (const size of [1, 7, 1000]) {
      it(`removes typeless and unknown operations from the stream (deltas of ${size})`, async () => {
        const raw = JSON.stringify({ operations: [typeless, add, unknown, update] }, null, 1);
        const input = JSON.parse(raw) as { operations: unknown[] };
        const out = await run([...frame, ...streamedCall('c1', split(raw, size), input), ...end]);

        const text = streamedText(out, 'c1');
        expect(JSON.parse(text)).toEqual({ operations: [add, update] });
        expect(out.find((c) => c.type === 'tool-input-available')).toMatchObject({
          input: { operations: [add, update] },
        });
        expect(out[2]).toEqual({ type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL });
      });
    }

    it('streams a valid operation before it is complete', async () => {
      const out = await run([
        ...frame,
        { type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL },
        {
          type: 'tool-input-delta',
          toolCallId: 'c1',
          inputTextDelta: '{"operations":[{"type":"add",',
        },
        { type: 'tool-input-delta', toolCallId: 'c1', inputTextDelta: '"blocks":["Hal' },
      ]);
      expect(streamedText(out, 'c1')).toBe('{"operations":[{"type":"add","blocks":["Hal');
    });

    it('waits until a partial type is final', async () => {
      const out = await run([
        ...frame,
        { type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL },
        {
          type: 'tool-input-delta',
          toolCallId: 'c1',
          inputTextDelta: '{"operations":[{"type":"add',
        },
      ]);
      expect(streamedText(out, 'c1')).toBe('');
    });

    it('drops a call whose operations are all invalid', async () => {
      const input = { operations: [typeless, unknown] };
      const out = await run([
        ...frame,
        ...streamedCall('c1', split(JSON.stringify(input), 5), input),
        ...end,
      ]);
      expect(out).toEqual([...frame, ...end]);
    });

    it('filters a non-streamed call', async () => {
      const out = await run([
        ...frame,
        {
          type: 'tool-input-available',
          toolCallId: 'c1',
          toolName: TOOL,
          input: { operations: [typeless, add] },
        },
        ...end,
      ]);
      expect(out).toEqual([
        ...frame,
        {
          type: 'tool-input-available',
          toolCallId: 'c1',
          toolName: TOOL,
          input: { operations: [add] },
        },
        ...end,
      ]);
    });
  });

  it('reads the registered operation types from the BlockNote tool schema', () => {
    const toolDefinitions = {
      [TOOL]: {
        inputSchema: {
          properties: {
            operations: {
              items: {
                anyOf: [
                  { properties: { type: { enum: ['update'] } } },
                  { properties: { type: { enum: ['delete'] } } },
                ],
              },
            },
          },
        },
      },
    };
    expect([...documentOperationTypes(toolDefinitions)]).toEqual(['update', 'delete']);
    expect(documentOperationTypes({}).size).toBe(0);
  });
});
