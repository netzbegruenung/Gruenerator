/**
 * Gemma 4's thinking markers, stripped from the answer text.
 *
 * Gemma 4 wraps its thinking in `<|channel>thought\n…<channel|>`. A host with a
 * reasoning parser moves that into `reasoning_content`; with thinking OFF no
 * parser runs, and the larger Gemma 4 models still open an (empty) thought
 * channel now and then — the markers then arrive verbatim in `content`.
 *
 * Live 11.10.2026 (Cortecs, `gemma-4-31b-it`, Sharepic-Folgefrage im Chat):
 * the answer was nothing but `<|channel>thought <channel|>`, repeated until
 * the provider's cap. Stripping alone would turn that into a silent, endless
 * empty stream, so a repeated channel counts as degeneration and errors the
 * stream: before the first visible token that is a clean sibling fallback.
 */

import { wrapLanguageModel } from 'ai';

import { createLogger } from '../../utils/logger.js';

import {
  createToolCallTextFilter,
  type TextToolCall,
  type ToolCallTextFilter,
} from './gemmaToolCallText.js';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

const OPEN = '<|channel>';
const CLOSE = '<channel|>';

/** One thought channel per turn is Gemma's format; more is a loop. */
const MAX_CHANNELS = 2;

export class GemmaChannelLoopError extends Error {
  constructor() {
    super(`Gemma emitted more than ${MAX_CHANNELS} thought channels — degenerate output`);
    this.name = 'GemmaChannelLoopError';
  }
}

/** Length of the longest suffix of `text` that is a proper prefix of `marker`. */
function partialMarkerTail(text: string, marker: string): number {
  for (let n = Math.min(marker.length - 1, text.length); n > 0; n--) {
    if (marker.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

export interface GemmaChannelFilter {
  /** Feed a raw delta; returns the visible text it releases. Throws
   *  {@link GemmaChannelLoopError} once the channels repeat. */
  push(delta: string): string;
  /** Release what was held back for a possibly split marker. */
  flush(): string;
}

export function createGemmaChannelFilter(): GemmaChannelFilter {
  let buffer = '';
  let inChannel = false;
  let channels = 0;
  let emitted = false;

  const release = (text: string): string => {
    // The text after an opening channel starts with the newline the template
    // puts there — leading whitespace of the answer is never content.
    const out = emitted ? text : text.trimStart();
    if (out.length > 0) emitted = true;
    return out;
  };

  return {
    push(delta) {
      buffer += delta;
      let out = '';
      while (true) {
        if (inChannel) {
          const close = buffer.indexOf(CLOSE);
          if (close === -1) {
            buffer = buffer.slice(buffer.length - partialMarkerTail(buffer, CLOSE));
            return release(out);
          }
          buffer = buffer.slice(close + CLOSE.length);
          inChannel = false;
          continue;
        }
        const open = buffer.indexOf(OPEN);
        if (open === -1) {
          const keep = partialMarkerTail(buffer, OPEN);
          out += buffer.slice(0, buffer.length - keep);
          buffer = buffer.slice(buffer.length - keep);
          return release(out);
        }
        out += buffer.slice(0, open);
        buffer = buffer.slice(open + OPEN.length);
        inChannel = true;
        if (++channels > MAX_CHANNELS) throw new GemmaChannelLoopError();
      }
    },
    flush() {
      const rest = inChannel ? '' : buffer;
      buffer = '';
      return release(rest);
    },
  };
}

/** Strip the markers from a complete text. */
export function stripGemmaChannels(text: string): string {
  const filter = createGemmaChannelFilter();
  return filter.push(text) + filter.flush();
}

const log = createLogger('GemmaToolCallText');

function toolNamesOf(tools: ReadonlyArray<{ name: string }> | undefined): Set<string> {
  return new Set((tools ?? []).map((t) => t.name));
}

function toolCallPart(call: TextToolCall) {
  // Counts how often a provider hands a call over as text — the number that
  // decides whether the filter is enough or the lane needs to change.
  log.warn(`tool call arrived as text: ${call.toolName}`);
  return {
    type: 'tool-call' as const,
    toolCallId: `text-call-${crypto.randomUUID().slice(0, 9)}`,
    toolName: call.toolName,
    input: JSON.stringify(call.input),
  };
}

/** The visible text and the tool calls of one complete text, markers removed. */
function extractText(text: string) {
  const filter = createToolCallTextFilter();
  const { text: visible, calls } = filter.push(stripGemmaChannels(text));
  return { text: visible + filter.flush(), calls };
}

/**
 * Below this, a string argument is a query, an id or a label — not the
 * answer, and showing it as text would be noise.
 */
const MIN_RESCUED_CHARS = 200;

function joinText(a: string, b: string): string {
  return a && b ? `${a}\n\n${b}` : a + b;
}

/**
 * Splits text calls into the ones that can run and the text to show for the
 * rest. A namespaced name (`gruenerator:draft_structured`) runs as its last
 * segment when that tool is mounted. A call to a tool that does not exist
 * carried the answer in its arguments: live 03.11.2026 the whole revised
 * Antrag sat in `draft_structured{inhalt:…}`, a tool removed in #3078.
 * Dropping it left the turn empty, and the chat answered „Ich konnte dazu
 * leider keine passende Antwort finden". Its longest string argument is shown
 * as the answer instead.
 */
function routeTextCalls(calls: TextToolCall[], known: Set<string>) {
  const runnable: TextToolCall[] = [];
  let text = '';
  for (const call of calls) {
    const name = known.has(call.toolName) ? call.toolName : call.toolName.replace(/^.*[:.]/, '');
    if (known.has(name)) {
      runnable.push({ ...call, toolName: name });
      continue;
    }
    const longest = Object.values(call.input)
      .filter((v): v is string => typeof v === 'string')
      .reduce((a, b) => (b.length > a.length ? b : a), '');
    const rescued = longest.length >= MIN_RESCUED_CHARS;
    log.warn(
      `text tool call to unknown tool ${call.toolName}: ${rescued ? 'argument shown as answer' : 'dropped'}`
    );
    if (rescued) text = joinText(text, longest);
  }
  return { runnable, text };
}

const middleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const result = await doGenerate();
    const known = toolNamesOf(params.tools);
    const content: typeof result.content = [];
    let called = false;
    for (const part of result.content) {
      if (part.type !== 'text') {
        content.push(part);
        continue;
      }
      const extracted = extractText(part.text);
      const { runnable, text } = routeTextCalls(extracted.calls, known);
      content.push({ ...part, text: joinText(extracted.text, text) });
      for (const call of runnable) {
        called = true;
        content.push(toolCallPart(call));
      }
    }
    return {
      ...result,
      content,
      ...(called && { finishReason: { ...result.finishReason, unified: 'tool-calls' as const } }),
    };
  },

  wrapStream: async ({ doStream, params }) => {
    const { stream, ...rest } = await doStream();
    const known = toolNamesOf(params.tools);
    const filters = new Map<string, GemmaChannelFilter>();
    const callFilters = new Map<string, ToolCallTextFilter>();
    type Part = typeof stream extends ReadableStream<infer P> ? P : never;
    const pendingCalls = new Map<string, TextToolCall[]>();
    const streamedText = new Map<string, boolean>();
    let called = false;

    return {
      ...rest,
      stream: stream.pipeThrough(
        new TransformStream<Part, Part>({
          transform(part, controller) {
            const callFilter = (id: string) => {
              let f = callFilters.get(id);
              if (!f) callFilters.set(id, (f = createToolCallTextFilter()));
              return f;
            };
            // Calls are emitted right after the text part that carried them.
            const emitCalls = (calls: TextToolCall[]) => {
              for (const call of calls) {
                called = true;
                controller.enqueue(toolCallPart(call));
              }
            };
            // Visible text of one push; a rescued argument follows the text
            // before it in the same part, a paragraph apart.
            const route = (id: string, pushed: { text: string; calls: TextToolCall[] }) => {
              const { runnable, text: rescued } = routeTextCalls(pushed.calls, known);
              const before = streamedText.get(id) || pushed.text.length > 0;
              const sep = before && rescued && !/^\s/.test(rescued) ? '\n\n' : '';
              const text = pushed.text + sep + rescued;
              if (text) streamedText.set(id, true);
              return { text, runnable };
            };

            if (part.type === 'text-delta') {
              let filter = filters.get(part.id);
              if (!filter) filters.set(part.id, (filter = createGemmaChannelFilter()));
              let delta: string;
              try {
                delta = filter.push(part.delta);
              } catch (error) {
                // Ends the readable side and cancels the upstream request.
                controller.enqueue({ type: 'error', error });
                controller.terminate();
                return;
              }
              const { text, runnable } = route(part.id, callFilter(part.id).push(delta));
              if (text.length > 0) controller.enqueue({ ...part, delta: text });
              if (runnable.length > 0) {
                pendingCalls.set(part.id, [...(pendingCalls.get(part.id) ?? []), ...runnable]);
              }
              return;
            }
            if (part.type === 'text-end') {
              const { text, runnable } = route(
                part.id,
                callFilter(part.id).push(filters.get(part.id)?.flush() ?? '')
              );
              const delta = text + callFilter(part.id).flush();
              if (delta.length > 0) controller.enqueue({ type: 'text-delta', id: part.id, delta });
              controller.enqueue(part);
              emitCalls([...(pendingCalls.get(part.id) ?? []), ...runnable]);
              pendingCalls.delete(part.id);
              return;
            }
            if (part.type === 'finish' && called) {
              controller.enqueue({
                ...part,
                finishReason: { ...part.finishReason, unified: 'tool-calls' },
              });
              return;
            }
            controller.enqueue(part);
          },
        })
      ),
    };
  },
};

export function withGemmaChannelFilter(model: Exclude<LanguageModel, string>) {
  return wrapLanguageModel({ model, middleware });
}
