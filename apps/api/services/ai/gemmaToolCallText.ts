/**
 * A tool call Gemma 4 typed as TEXT instead of as a structured call.
 *
 * Gemma's template wraps a call in `<|tool_call>call:name{key:<|"|>value<|"|>}<tool_call|>`.
 * A host with a tool parser turns that into a tool call; when it does not (or
 * the model mixes the syntax, e.g. plain quotes), the marker reaches the answer
 * and the chat shows `<|tool_call>call:edit_current_sharepic{…}<tool_call|>`
 * while nothing runs. This scanner lifts such a call out of the text so the
 * caller can execute it, and removes the markers either way.
 */

const OPEN = '<|tool_call>';
const CLOSE = '<tool_call|>';
const NATIVE_QUOTE = '<|"|>';

export interface TextToolCall {
  toolName: string;
  input: Record<string, unknown>;
}

function partialTail(text: string, marker: string): number {
  for (let n = Math.min(marker.length - 1, text.length); n > 0; n--) {
    if (marker.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

/** Quote bare object keys, outside string literals only. */
function quoteBareKeys(source: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      out += ch;
      if (ch === '\\') out += source[++i] ?? '';
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    const key = /^[A-Za-z_][\w-]*(?=\s*:)/.exec(source.slice(i));
    if (key && /[{,]\s*$/.test(out)) {
      out += `"${key[0]}"`;
      i += key[0].length - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** `call:name{…}` → the call, or null when the arguments do not parse. */
export function parseTextToolCall(body: string): TextToolCall | null {
  const match = /^\s*call:([\w.-]+)\s*(\{[\s\S]*\})\s*$/.exec(body);
  if (!match) return null;
  const native = match[2]!
    .split(NATIVE_QUOTE)
    .map((piece, i) => (i % 2 === 1 ? JSON.stringify(piece) : piece))
    .join('');
  try {
    const input: unknown = JSON.parse(quoteBareKeys(native));
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
    return { toolName: match[1]!, input: input as Record<string, unknown> };
  } catch {
    return null;
  }
}

export interface ToolCallTextFilter {
  /** Feed a delta; returns the visible text and the calls completed by it. */
  push(delta: string): { text: string; calls: TextToolCall[] };
  /** Release held-back text; an unclosed call is dropped. */
  flush(): string;
}

export function createToolCallTextFilter(): ToolCallTextFilter {
  let buffer = '';
  let inCall = false;
  return {
    push(delta) {
      buffer += delta;
      let text = '';
      const calls: TextToolCall[] = [];
      for (;;) {
        if (inCall) {
          const close = buffer.indexOf(CLOSE);
          if (close === -1) return { text, calls };
          const call = parseTextToolCall(buffer.slice(0, close));
          if (call) calls.push(call);
          buffer = buffer.slice(close + CLOSE.length);
          inCall = false;
          continue;
        }
        const open = buffer.indexOf(OPEN);
        if (open === -1) {
          const keep = partialTail(buffer, OPEN);
          text += buffer.slice(0, buffer.length - keep);
          buffer = buffer.slice(buffer.length - keep);
          return { text, calls };
        }
        text += buffer.slice(0, open);
        buffer = buffer.slice(open + OPEN.length);
        inCall = true;
      }
    },
    flush() {
      const rest = inCall ? '' : buffer;
      buffer = '';
      inCall = false;
      return rest;
    },
  };
}
