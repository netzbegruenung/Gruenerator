import { type WebViewInboundMessage } from '@gruenerator/shared';
import { describe, expect, it, vi } from 'vitest';

import { createFileTransferReceiver, type TransferTarget } from './fileTransfer';

function setup() {
  const replies: WebViewInboundMessage[] = [];
  const files: (TransferTarget & { bytes: number[]; state: string })[] = [];
  const deliver = vi.fn().mockResolvedValue(undefined);
  const receiver = createFileTransferReceiver({
    create: () => {
      const file = {
        bytes: [] as number[],
        state: 'open',
        write(bytes: Uint8Array) {
          file.bytes.push(...bytes);
        },
        close() {
          file.state = 'closed';
        },
        discard() {
          file.state = 'discarded';
        },
      };
      files.push(file);
      return file;
    },
    decode: (base64) => Uint8Array.from(Buffer.from(base64, 'base64')),
    reply: (message) => replies.push(message),
    deliver,
  });
  return { receiver, replies, files, deliver };
}

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const begin = (size: number) =>
  ({
    type: 'FILE_TRANSFER_BEGIN',
    transferId: 't',
    filename: 'v.mp4',
    mime: 'video/mp4',
    size,
  }) as const;
const chunk = (index: number, bytes: number[]) =>
  ({ type: 'FILE_TRANSFER_CHUNK', transferId: 't', index, data: b64(bytes) }) as const;
const end = { type: 'FILE_TRANSFER_END', transferId: 't' } as const;

describe('file transfer receiver', () => {
  it('acknowledges each step, writes in order and delivers the closed file', async () => {
    const { receiver, replies, files, deliver } = setup();
    await receiver.handle(begin(5));
    await receiver.handle(chunk(0, [1, 2, 3]));
    await receiver.handle(chunk(1, [4, 5]));
    await receiver.handle(end);

    expect(replies).toEqual(
      [0, 1, 2, 3].map((received) => ({
        type: 'FILE_TRANSFER_ACK',
        transferId: 't',
        received,
      }))
    );
    expect(files[0]?.bytes).toEqual([1, 2, 3, 4, 5]);
    expect(files[0]?.state).toBe('closed');
    expect(deliver).toHaveBeenCalledWith(files[0], 'v.mp4', 'video/mp4');
  });

  it('fails and discards on a chunk out of order', async () => {
    const { receiver, replies, files } = setup();
    await receiver.handle(begin(5));
    await receiver.handle(chunk(1, [1]));
    expect(replies.at(-1)).toMatchObject({ type: 'FILE_TRANSFER_FAILED', transferId: 't' });
    expect(files[0]?.state).toBe('discarded');
  });

  it('refuses more bytes than announced, and an end before all of them', async () => {
    const over = setup();
    await over.receiver.handle(begin(2));
    await over.receiver.handle(chunk(0, [1, 2, 3]));
    expect(over.replies.at(-1)?.type).toBe('FILE_TRANSFER_FAILED');

    const under = setup();
    await under.receiver.handle(begin(4));
    await under.receiver.handle(chunk(0, [1, 2]));
    await under.receiver.handle(end);
    expect(under.replies.at(-1)?.type).toBe('FILE_TRANSFER_FAILED');
    expect(under.deliver).not.toHaveBeenCalled();
    expect(under.files[0]?.state).toBe('discarded');
  });

  it('answers a chunk for an unknown transfer with a failure', async () => {
    const { receiver, replies } = setup();
    await receiver.handle(chunk(0, [1]));
    expect(replies).toEqual([
      { type: 'FILE_TRANSFER_FAILED', transferId: 't', reason: 'unknown transfer' },
    ]);
  });

  it('drops the partial file on abort and on dispose', async () => {
    const aborted = setup();
    await aborted.receiver.handle(begin(4));
    await aborted.receiver.handle({ type: 'FILE_TRANSFER_ABORT', transferId: 't' });
    expect(aborted.files[0]?.state).toBe('discarded');

    const disposed = setup();
    await disposed.receiver.handle(begin(4));
    disposed.receiver.dispose();
    expect(disposed.files[0]?.state).toBe('discarded');
  });

  it('refuses a duplicate begin without dropping the running transfer', async () => {
    const { receiver, replies, files, deliver } = setup();
    await receiver.handle(begin(2));
    await receiver.handle(begin(2));
    expect(replies.at(-1)).toMatchObject({
      type: 'FILE_TRANSFER_FAILED',
      reason: 'duplicate transfer',
    });
    await receiver.handle(chunk(0, [1, 2]));
    await receiver.handle(end);
    expect(files).toHaveLength(1);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('lets a new transfer push out the oldest when the slots are taken', async () => {
    const { receiver, replies, files } = setup();
    for (const id of ['a', 'b', 'c']) {
      await receiver.handle({ ...begin(1), transferId: id });
    }
    expect(files[0]?.state).toBe('discarded');
    expect(replies).toContainEqual({
      type: 'FILE_TRANSFER_FAILED',
      transferId: 'a',
      reason: 'superseded by a newer transfer',
    });
    expect(replies.at(-1)).toEqual({ type: 'FILE_TRANSFER_ACK', transferId: 'c', received: 0 });
  });

  it('reports a failed close and keeps cleanup errors quiet', async () => {
    const { receiver, replies, files } = setup();
    await receiver.handle(begin(1));
    await receiver.handle(chunk(0, [1]));
    const file = files[0]!;
    file.close = () => {
      throw new Error('disk full');
    };
    file.discard = () => {
      throw new Error('already closed');
    };
    await receiver.handle(end);
    expect(replies.at(-1)).toMatchObject({ type: 'FILE_TRANSFER_FAILED', reason: 'close failed' });
    await expect(receiver.handle({ type: 'FILE_TRANSFER_ABORT', transferId: 't' })).resolves.toBe(
      undefined
    );
  });
});
