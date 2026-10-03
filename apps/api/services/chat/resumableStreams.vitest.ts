import { createInMemoryResumableStreamStore } from 'assistant-stream/resumable';
import { describe, it, expect, vi } from 'vitest';

import { SSEWriter } from '../../routes/chat/services/sseHelpers.js';

import { startStreamRecorder } from './resumableStreams.js';

import type { Response } from 'express';

vi.mock('../../utils/redis/client.js', () => ({ default: {} }));

const STREAM_ID = '7f1c0d1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f';

/** Everything the store holds for a stream, as text. Ends once it is finalized. */
async function readAll(
  store: ReturnType<typeof createInMemoryResumableStreamStore>,
  id = STREAM_ID
): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const entry of store.read(id, '', new AbortController().signal)) {
    out += decoder.decode(entry.chunk, { stream: true });
  }
  return out;
}

function fakeRes(): Response & { written: string; destroyed: boolean } {
  const res = {
    written: '',
    writableEnded: false,
    destroyed: false,
    write(chunk: string) {
      res.written += chunk;
      return true;
    },
    end() {
      res.writableEnded = true;
      return res;
    },
    json: () => res,
    send: () => res,
  };
  return res as unknown as Response & { written: string; destroyed: boolean };
}

describe('resumable stream recorder', () => {
  it('stores every frame in order and finalizes on finish', async () => {
    const store = createInMemoryResumableStreamStore();
    const rec = await startStreamRecorder(STREAM_ID, { store });
    expect(rec).not.toBeNull();
    rec!.record('a');
    rec!.record('b');
    rec!.record('c');
    await rec!.finish();
    expect(await readAll(store)).toBe('abc');
    expect(await store.status(STREAM_ID)).toBe('done');
  });

  it('returns null when the id is already being produced', async () => {
    const store = createInMemoryResumableStreamStore();
    await startStreamRecorder(STREAM_ID, { store });
    expect(await startStreamRecorder(STREAM_ID, { store })).toBeNull();
  });

  it('reports a deleted stream as cancelled, once', async () => {
    const store = createInMemoryResumableStreamStore();
    const onCancelled = vi.fn();
    const rec = await startStreamRecorder(STREAM_ID, { store, onCancelled });
    await store.delete(STREAM_ID);
    rec!.record('x');
    await rec!.finish();
    rec!.record('y');
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });
});

describe('SSEWriter tee', () => {
  it('records the same bytes the client got, including frames sent before attach', async () => {
    const store = createInMemoryResumableStreamStore();
    const res = fakeRes();
    const sse = new SSEWriter(res, { recordable: true });
    sse.send('thread_created', { threadId: 't1' });
    sse.attachRecorder((await startStreamRecorder(STREAM_ID, { store }))!, STREAM_ID);
    sse.send('text_delta', { text: 'Hallo' });
    sse.sendRaw('done', { threadId: 't1' });
    sse.end();

    const stored = await readAll(store);
    expect(stored).toBe(res.written);
    expect(stored).toContain('event: stream_started\ndata: {"streamId":"' + STREAM_ID + '"}');
    expect(stored.indexOf('thread_created')).toBeLessThan(stored.indexOf('stream_started'));
  });

  it('keeps recording after the client disconnected', async () => {
    const store = createInMemoryResumableStreamStore();
    const res = fakeRes();
    const sse = new SSEWriter(res, { recordable: true });
    sse.attachRecorder((await startStreamRecorder(STREAM_ID, { store }))!, STREAM_ID);
    res.destroyed = true;
    sse.send('text_delta', { text: 'weiter' });
    sse.end();

    expect(res.written).not.toContain('weiter');
    expect(await readAll(store)).toContain('"text":"weiter"');
  });
});
