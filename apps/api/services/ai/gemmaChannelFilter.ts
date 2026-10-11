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

const middleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return {
      ...result,
      content: result.content.map((part) =>
        part.type === 'text' ? { ...part, text: stripGemmaChannels(part.text) } : part
      ),
    };
  },

  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();
    const filters = new Map<string, GemmaChannelFilter>();
    type Part = typeof stream extends ReadableStream<infer P> ? P : never;

    return {
      ...rest,
      stream: stream.pipeThrough(
        new TransformStream<Part, Part>({
          transform(part, controller) {
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
              if (delta.length > 0) controller.enqueue({ ...part, delta });
              return;
            }
            if (part.type === 'text-end') {
              const delta = filters.get(part.id)?.flush() ?? '';
              if (delta.length > 0) controller.enqueue({ type: 'text-delta', id: part.id, delta });
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
