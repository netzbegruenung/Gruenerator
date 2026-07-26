/**
 * Shared SSE line parser for model adapters and streaming hooks.
 *
 * Parses lines from an SSE stream in the standard format:
 *   event: <event-type>\n
 *   data: <json-payload>\n
 *
 * The `currentEvent` object is mutable state passed across calls —
 * the event type is set on an "event:" line and consumed on the
 * next "data:" line.
 */

export interface SSECurrentEvent {
  type: string;
}

export interface SSEParseResult {
  event?: string;
  data?: unknown;
  /** The data line was unparseable JSON — a truncated frame, i.e. exactly what
   *  a mid-stream cut produces. Callers count these; a run of them means the
   *  stream is corrupt and must be reported, not silently dropped. */
  parseError?: boolean;
}

export function parseSSELine(line: string, currentEvent: SSECurrentEvent): SSEParseResult {
  if (line.startsWith('event: ')) {
    currentEvent.type = line.slice(7).trim();
    return {};
  }

  if (line.startsWith('data: ')) {
    const pendingType = currentEvent.type;
    // Clear the pending type BEFORE parsing: on a truncated data line the type
    // used to survive and mislabel the NEXT data line, so a continuation
    // fragment could be parsed as e.g. `error` or `done`.
    currentEvent.type = '';
    try {
      return { event: pendingType, data: JSON.parse(line.slice(6)) };
    } catch {
      console.warn(`[SSE] Unparsable data line for event "${pendingType}":`, line.slice(0, 200));
      return { parseError: true };
    }
  }

  return {};
}
