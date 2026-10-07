import { parsePartialJson, type UIMessageChunk } from 'ai';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('DocsAI');

const DOCUMENT_TOOL = 'applyDocumentOperations';
const TERMINAL = new Set<UIMessageChunk['type']>(['finish-step', 'finish', 'error', 'abort']);

function hasOperations(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const { operations } = input as { operations?: unknown };
  return Array.isArray(operations) && operations.length > 0;
}

/**
 * Removes `applyDocumentOperations` calls that never carry an operation.
 *
 * BlockNote's client (`filterNewOrUpdatedOperations` in @blocknote/xl-ai 0.55)
 * throws "No operations seen" for such a call, and the rejection escapes as an
 * unhandled promise before `invokeAI` gets to it (GlitchTip #679). A call
 * with `{ "operations": [] }` is the model saying "nothing to change", so
 * dropping it is lossless: the client sees a response without tool calls.
 *
 * A streamed call is held back until its partial input contains an operation,
 * then released unchanged — the typing effect starts one delta later, not at
 * the end of the call.
 */
export function dropEmptyDocumentOperations(): TransformStream<UIMessageChunk, UIMessageChunk> {
  const held = new Map<string, { chunks: UIMessageChunk[]; text: string }>();

  const release = (
    toolCallId: string,
    controller: TransformStreamDefaultController<UIMessageChunk>
  ) => {
    const pending = held.get(toolCallId);
    if (!pending) return;
    held.delete(toolCallId);
    for (const c of pending.chunks) controller.enqueue(c);
  };

  // A call cut off mid-stream (abort, provider error, step end) reaches the
  // client as before, ahead of the chunk that ends it; the client's own error
  // path handles an incomplete input.
  const releaseAll = (controller: TransformStreamDefaultController<UIMessageChunk>) => {
    for (const toolCallId of [...held.keys()]) release(toolCallId, controller);
  };

  return new TransformStream({
    async transform(chunk, controller) {
      if (chunk.type === 'tool-input-start' && chunk.toolName === DOCUMENT_TOOL) {
        held.set(chunk.toolCallId, { chunks: [chunk], text: '' });
        return;
      }

      if (
        chunk.type === 'tool-input-available' &&
        chunk.toolName === DOCUMENT_TOOL &&
        !hasOperations(chunk.input)
      ) {
        held.delete(chunk.toolCallId);
        log.warn(`[DocsAI] Dropped ${DOCUMENT_TOOL} call without operations (${chunk.toolCallId})`);
        return;
      }

      if (chunk.type === 'tool-input-delta') {
        const pending = held.get(chunk.toolCallId);
        if (pending) {
          pending.chunks.push(chunk);
          pending.text += chunk.inputTextDelta;
          const { value } = await parsePartialJson(pending.text);
          if (hasOperations(value)) release(chunk.toolCallId, controller);
          return;
        }
      } else if ('toolCallId' in chunk) {
        release(chunk.toolCallId, controller);
      } else if (TERMINAL.has(chunk.type)) {
        releaseAll(controller);
      }

      controller.enqueue(chunk);
    },

    flush: releaseAll,
  });
}
