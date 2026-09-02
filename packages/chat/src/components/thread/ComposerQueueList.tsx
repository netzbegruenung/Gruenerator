'use client';

import { useAui, useAuiState } from '@assistant-ui/react';

import { MessageQueue, type QueuedMessage } from '../assistant-ui/elements/message-queue';

interface ComposerQueueListProps {
  className?: string;
}

/**
 * Feeds the vendored MessageQueue element from the runtime. Everything visual
 * lives in that element; this file is only the wiring, so a re-sync of the
 * element never has to reason about the queue runtime.
 *
 * `ComposerPrimitive.Queue` is deliberately not used. Its render prop hands
 * over one item at a time without its position, and the element numbers the
 * rows — an array is what it wants.
 */
export function ComposerQueueList({ className }: ComposerQueueListProps) {
  const composer = useAui().composer;

  // Selected raw, mapped below. `useAuiState` compares with Object.is, so a
  // selector that builds an array re-renders on EVERY store update — which
  // while a turn is queued means every streamed token.
  const queue = useAuiState((s) => s.composer.queue);

  // `prompt` is deprecated upstream (removal after 2026-11-05); the text parts
  // are the durable shape. A turn carrying only files has no text of its own,
  // so it falls back to the file names rather than a blank row.
  const queued = queue.map((item): QueuedMessage => {
    const text = item.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim();

    return {
      id: item.id,
      text:
        text ||
        item.parts
          .map((part) => (part.type === 'file' ? (part.filename ?? '') : ''))
          .filter(Boolean)
          .join(', '),
    };
  });

  // The turn the queue is waiting behind. There is no runtime field for it, so
  // it comes off the last user message. The selector returns a string, which
  // does not change while the answer streams — so this costs no re-render per
  // chunk despite reading the message list.
  const running = useAuiState((s) => {
    for (let i = s.thread.messages.length - 1; i >= 0; i--) {
      const message = s.thread.messages[i];
      if (message?.role !== 'user') continue;
      return message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim();
    }
    return '';
  });

  if (queued.length === 0) return null;

  return (
    <MessageQueue
      running={running}
      queued={queued}
      onCancel={(id) => composer.queueItem({ id }).remove()}
      // Upstream sizes the element for its demo; here it spans the composer.
      className={`max-w-none ${className ?? ''}`}
    />
  );
}
