/**
 * Taking a file from an embedded page in pieces (`HOST_CAPABILITY_FILE_TRANSFER`).
 *
 * One `DOWNLOAD_FILE` carries at most ~9 MB, and an exported video is several
 * times that. The page sends `FILE_TRANSFER_BEGIN`, then one chunk at a time,
 * each only after this side acknowledged the previous one, then `…_END`. So no
 * message is large and the bytes go to disk as they arrive, never into memory
 * as a whole.
 *
 * The rules live here, the IO behind `FileTransferIo` (`receiveFileTransfer.ts`),
 * the same split as `downloadPolicy.ts`: what the page may make this side write
 * is checkable without a device.
 */

import { type WebViewInboundMessage, type WebViewOutboundMessage } from '@gruenerator/shared';

export type FileTransferMessage = Extract<
  WebViewOutboundMessage,
  {
    type:
      'FILE_TRANSFER_BEGIN' | 'FILE_TRANSFER_CHUNK' | 'FILE_TRANSFER_END' | 'FILE_TRANSFER_ABORT';
  }
>;

/** Where one transfer's bytes go: a file in the cache, in the app. */
export interface TransferTarget {
  write(bytes: Uint8Array): void;
  /** All bytes are in; the file stays for delivery. */
  close(): void;
  /** The transfer is off; the partial file goes. */
  discard(): void;
}

export interface FileTransferIo<T extends TransferTarget> {
  create(filename: string): T;
  decode(base64: string): Uint8Array;
  reply(message: WebViewInboundMessage): void;
  /** Hands the finished file to the user; rejects if that fails. */
  deliver(target: T, filename: string, mime: string): Promise<void>;
}

/** More at once is a page misbehaving, not a user exporting. */
const MAX_OPEN_TRANSFERS = 2;

interface OpenTransfer<T> {
  target: T;
  filename: string;
  mime: string;
  size: number;
  written: number;
  next: number;
}

/** Cleanup must not turn into an error of its own: the cache is the OS's to clear. */
function discardQuietly(target: TransferTarget): void {
  try {
    target.discard();
  } catch {
    // Best effort.
  }
}

export function createFileTransferReceiver<T extends TransferTarget>(io: FileTransferIo<T>) {
  const open = new Map<string, OpenTransfer<T>>();

  const fail = (transferId: string, reason: string) => {
    const transfer = open.get(transferId);
    open.delete(transferId);
    if (transfer) discardQuietly(transfer.target);
    io.reply({ type: 'FILE_TRANSFER_FAILED', transferId, reason });
  };

  /** Resolves once a finished transfer is delivered; rejects if delivery fails. */
  async function handle(message: FileTransferMessage): Promise<void> {
    const transferId = message.transferId;
    if (message.type === 'FILE_TRANSFER_BEGIN') {
      // Refused without touching the transfer already running under this id.
      if (open.has(transferId)) {
        io.reply({ type: 'FILE_TRANSFER_FAILED', transferId, reason: 'duplicate transfer' });
        return;
      }
      // A page that reloaded mid-transfer never sends ABORT; its transfers
      // would hold the slots for the life of the screen. The newest wins.
      while (open.size >= MAX_OPEN_TRANSFERS) {
        const [oldest] = open.keys();
        if (oldest === undefined) break;
        fail(oldest, 'superseded by a newer transfer');
      }
      let target: T;
      try {
        target = io.create(message.filename);
      } catch {
        return fail(transferId, 'could not create file');
      }
      open.set(transferId, {
        target,
        filename: message.filename,
        mime: message.mime,
        size: message.size,
        written: 0,
        next: 0,
      });
      io.reply({ type: 'FILE_TRANSFER_ACK', transferId, received: 0 });
      return;
    }

    const transfer = open.get(transferId);
    if (message.type === 'FILE_TRANSFER_ABORT') {
      open.delete(transferId);
      if (transfer) discardQuietly(transfer.target);
      return;
    }
    if (!transfer) return fail(transferId, 'unknown transfer');

    if (message.type === 'FILE_TRANSFER_CHUNK') {
      if (message.index !== transfer.next) return fail(transferId, 'chunk out of order');
      let bytes: Uint8Array;
      try {
        bytes = io.decode(message.data);
      } catch {
        return fail(transferId, 'chunk is not base64');
      }
      if (transfer.written + bytes.length > transfer.size) {
        return fail(transferId, 'more bytes than announced');
      }
      try {
        transfer.target.write(bytes);
      } catch {
        return fail(transferId, 'write failed');
      }
      transfer.written += bytes.length;
      transfer.next += 1;
      io.reply({ type: 'FILE_TRANSFER_ACK', transferId, received: transfer.next });
      return;
    }

    // FILE_TRANSFER_END
    if (transfer.written !== transfer.size) return fail(transferId, 'fewer bytes than announced');
    try {
      transfer.target.close();
    } catch {
      return fail(transferId, 'close failed');
    }
    open.delete(transferId);
    // One past the last chunk: the file is complete on disk. The page waits
    // for this, so a refused END reaches it as FAILED instead of a silent
    // success. Delivery (gallery, share sheet) waits on the user and reports
    // its own failure natively.
    io.reply({ type: 'FILE_TRANSFER_ACK', transferId, received: transfer.next + 1 });
    await io.deliver(transfer.target, transfer.filename, transfer.mime);
  }

  /** The screen goes (or its page died): every unfinished file goes with it. */
  function dispose(): void {
    for (const transfer of open.values()) discardQuietly(transfer.target);
    open.clear();
  }

  return { handle, dispose };
}
