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
}

export function parseSSELine(line: string, currentEvent: SSECurrentEvent): SSEParseResult {
  if (line.startsWith('event: ')) {
    currentEvent.type = line.slice(7).trim();
    return {};
  }

  if (line.startsWith('data: ')) {
    try {
      const data = JSON.parse(line.slice(6));
      const event = currentEvent.type;
      currentEvent.type = '';
      return { event, data };
    } catch {
      return {};
    }
  }

  return {};
}
