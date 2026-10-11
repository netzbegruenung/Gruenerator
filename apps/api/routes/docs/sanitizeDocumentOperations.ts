import { parsePartialJson, type UIMessageChunk } from 'ai';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('DocsAI');

const DOCUMENT_TOOL = 'applyDocumentOperations';

/**
 * The operation types the client registered, read from the `applyDocumentOperations`
 * schema BlockNote sends (`operations.items.anyOf[*].properties.type.enum`).
 */
export function documentOperationTypes(toolDefinitions: unknown): Set<string> {
  const schema = (toolDefinitions as Record<string, { inputSchema?: unknown }> | undefined)?.[
    DOCUMENT_TOOL
  ]?.inputSchema as { properties?: { operations?: { items?: { anyOf?: unknown[] } } } } | undefined;
  const types = new Set<string>();
  for (const variant of schema?.properties?.operations?.items?.anyOf ?? []) {
    const values = (variant as { properties?: { type?: { enum?: unknown[] } } }).properties?.type
      ?.enum;
    for (const v of values ?? []) if (typeof v === 'string') types.add(v);
  }
  // Empty means only a missing `type` is filtered, not an unknown one.
  if (types.size === 0) {
    log.warn(
      `[DocsAI] No operation types found in the ${DOCUMENT_TOOL} schema — unknown types pass through`
    );
  }
  return types;
}

type Element = { start: number; released: boolean };

type CallState = {
  start: UIMessageChunk;
  started: boolean;
  raw: string;
  pos: number;
  depth: number;
  inString: boolean;
  escaped: boolean;
  phase: 'head' | 'ops' | 'tail';
  headEnd: number;
  element: Element | null;
  emittedTo: number;
  kept: number;
};

/**
 * Removes operations BlockNote's client would reject, and `applyDocumentOperations`
 * calls left without any.
 *
 * @blocknote/xl-ai 0.55 validates each operation once it is complete and aborts the
 * whole edit on the first one without a known `type` ("Invalid operation. The `type`
 * property of an operation is required.", GlitchTip #681) or on a call without
 * operations ("No operations seen", GlitchTip #679) — both escape as unhandled
 * rejections, and the operations after the bad one are never applied. The tool's
 * JSON schema is not enforced server-side (BlockNote wraps it without a validator),
 * so the model's output arrives as-is.
 *
 * The streamed input is rewritten element by element: an operation is forwarded as
 * soon as its partial JSON shows a known `type`, so the typing effect stays; one that
 * ends without such a type is dropped together with its separator. The final
 * `tool-input-available` input is filtered the same way. A call is held back until
 * its first operation is forwarded, so a call that keeps none never reaches the client.
 */
export function sanitizeDocumentOperations(
  allowedTypes: ReadonlySet<string>
): TransformStream<UIMessageChunk, UIMessageChunk> {
  const calls = new Map<string, CallState>();

  const isValidOperation = (op: unknown): boolean => {
    if (typeof op !== 'object' || op === null) return false;
    const { type } = op as { type?: unknown };
    return typeof type === 'string' && (allowedTypes.size === 0 || allowedTypes.has(type));
  };

  const drop = (toolCallId: string, op: string) => {
    log.warn(`[DocsAI] Dropped invalid document operation (${toolCallId}): ${op.slice(0, 500)}`);
  };

  // Advances the scanner over newly received text and returns the text to forward.
  const advance = async (toolCallId: string, call: CallState): Promise<string> => {
    let out = '';
    const emitElementText = (element: Element, end: number) => {
      if (!element.released) return;
      out += call.raw.slice(call.emittedTo, end);
      call.emittedTo = end;
    };
    const releaseElement = (element: Element, end: number) => {
      out += call.kept === 0 ? call.raw.slice(0, call.headEnd) : ',';
      element.released = true;
      call.emittedTo = element.start;
      call.kept++;
      emitElementText(element, end);
    };
    const closeElement = async (element: Element, end: number) => {
      if (element.released) {
        emitElementText(element, end);
        return;
      }
      const text = call.raw.slice(element.start, end).trim();
      const { value } = await parsePartialJson(text);
      if (isValidOperation(value)) releaseElement(element, element.start + text.length);
      else drop(toolCallId, text);
    };

    for (; call.pos < call.raw.length; call.pos++) {
      const ch = call.raw[call.pos];
      if (call.inString) {
        if (call.escaped) call.escaped = false;
        else if (ch === '\\') call.escaped = true;
        else if (ch === '"') call.inString = false;
        continue;
      }
      if (call.phase === 'ops' && call.depth === 2) {
        if (ch === ',' || ch === ']') {
          if (call.element) await closeElement(call.element, call.pos);
          call.element = null;
          if (ch === ']') {
            call.phase = 'tail';
            call.emittedTo = call.pos;
          }
        } else if (!call.element && !/\s/.test(ch)) {
          call.element = { start: call.pos, released: false };
        }
      }
      if (ch === '"') call.inString = true;
      else if (ch === '{' || ch === '[') {
        call.depth++;
        if (call.phase === 'head' && ch === '[' && call.depth === 2) {
          call.phase = 'ops';
          call.headEnd = call.pos + 1;
        }
      } else if (ch === '}' || ch === ']') call.depth--;
    }

    const element = call.element;
    if (call.phase === 'ops' && element) {
      if (!element.released) {
        const { value } = await parsePartialJson(call.raw.slice(element.start));
        // A partial value only proves its `type` is final once a later key shows up
        // or no string is open ("add" could still grow into "addBlock").
        if (
          isValidOperation(value) &&
          (!call.inString || Object.keys(value as object).length > 1)
        ) {
          releaseElement(element, call.raw.length);
        }
      } else {
        emitElementText(element, call.raw.length);
      }
    } else if (call.phase === 'tail' && call.kept > 0) {
      out += call.raw.slice(call.emittedTo);
      call.emittedTo = call.raw.length;
    }
    return out;
  };

  const ensureStarted = (
    call: CallState,
    controller: TransformStreamDefaultController<UIMessageChunk>
  ) => {
    if (call.started) return;
    call.started = true;
    controller.enqueue(call.start);
  };

  return new TransformStream({
    async transform(chunk, controller) {
      if (chunk.type === 'tool-input-start' && chunk.toolName === DOCUMENT_TOOL) {
        calls.set(chunk.toolCallId, {
          start: chunk,
          started: false,
          raw: '',
          pos: 0,
          depth: 0,
          inString: false,
          escaped: false,
          phase: 'head',
          headEnd: 0,
          element: null,
          emittedTo: 0,
          kept: 0,
        });
        return;
      }

      if (chunk.type === 'tool-input-delta') {
        const call = calls.get(chunk.toolCallId);
        if (call) {
          call.raw += chunk.inputTextDelta;
          const text = await advance(chunk.toolCallId, call);
          if (text) {
            ensureStarted(call, controller);
            controller.enqueue({ ...chunk, inputTextDelta: text });
          }
          return;
        }
      }

      if (chunk.type === 'tool-input-available' && chunk.toolName === DOCUMENT_TOOL) {
        const call = calls.get(chunk.toolCallId);
        calls.delete(chunk.toolCallId);
        const { operations } = (chunk.input ?? {}) as { operations?: unknown };
        const all: unknown[] = Array.isArray(operations) ? operations : [];
        const kept = all.filter(isValidOperation);
        // The streamed path already logged what it dropped.
        if (!call) {
          for (const op of all)
            if (!isValidOperation(op)) drop(chunk.toolCallId, JSON.stringify(op));
        }
        if (kept.length === 0) {
          log.warn(
            `[DocsAI] Dropped ${DOCUMENT_TOOL} call without valid operations (${chunk.toolCallId})`
          );
          return;
        }
        if (call) ensureStarted(call, controller);
        controller.enqueue(
          kept.length === all.length
            ? chunk
            : { ...chunk, input: { ...(chunk.input as object), operations: kept } }
        );
        return;
      }

      if ('toolCallId' in chunk) {
        const call = calls.get(chunk.toolCallId);
        if (call) ensureStarted(call, controller);
      }

      controller.enqueue(chunk);
    },
  });
}
