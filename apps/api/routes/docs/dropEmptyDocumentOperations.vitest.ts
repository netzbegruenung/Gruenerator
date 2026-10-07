import { type UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { dropEmptyDocumentOperations } = await import('./dropEmptyDocumentOperations.js');

const TOOL = 'applyDocumentOperations';

async function run(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const source = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const out: UIMessageChunk[] = [];
  const reader = source.pipeThrough(dropEmptyDocumentOperations()).getReader();
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

const frame: UIMessageChunk[] = [{ type: 'start' }, { type: 'start-step' }];
const end: UIMessageChunk[] = [{ type: 'finish-step' }, { type: 'finish' }];

describe('dropEmptyDocumentOperations', () => {
  it('passes a call with operations through unchanged and in order', async () => {
    const input = { operations: [{ type: 'delete', id: 'a$' }] };
    const chunks = [
      ...frame,
      ...streamedCall('c1', ['{"operations":', '[{"type":"del', 'ete","id":"a$"}]}'], input),
      ...end,
    ];
    expect(await run(chunks)).toEqual(chunks);
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

  it('releases an unfinished call before the chunk that ends the stream', async () => {
    const start: UIMessageChunk = { type: 'tool-input-start', toolCallId: 'c1', toolName: TOOL };
    const delta: UIMessageChunk = {
      type: 'tool-input-delta',
      toolCallId: 'c1',
      inputTextDelta: '{"operations":[',
    };
    const error: UIMessageChunk = { type: 'error', errorText: 'provider down' };
    expect(await run([...frame, start, delta, error])).toEqual([...frame, start, delta, error]);
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
});
