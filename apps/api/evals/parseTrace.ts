/**
 * Pure SSE-stream → ChatTrace parser. No IO, so it unit-tests against captured
 * fixtures (parseTrace.vitest.ts) and the runner just feeds it the raw body.
 */
import { type ChatTrace, type SseEvent, type TracedToolCall } from './types.js';

/** Parse a raw SSE body (`event: x\ndata: {...}\n\n` frames) into events. */
export function parseSseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of raw.split(/\n\n+/)) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!event) continue;
    let parsed: Record<string, unknown> = {};
    if (data) {
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        parsed = { _unparsed: data };
      }
    }
    events.push({ event, data: parsed });
  }
  return events;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function buildTrace(events: SseEvent[], latencyMs: number): ChatTrace {
  const trace: ChatTrace = {
    intent: null,
    agentic: false,
    toolCalls: [],
    sharepicGenerated: false,
    imageGenerated: false,
    citations: [],
    sources: 0,
    fullText: '',
    latencyMs,
    error: null,
  };

  const stepsById = new Map<string, TracedToolCall>();
  let sawDone = false;

  for (const { event, data } of events) {
    switch (event) {
      case 'intent': {
        if (typeof data.intent === 'string') trace.intent = data.intent;
        trace.agentic = data.agentic === true;
        break;
      }
      case 'tool_step_start': {
        const stepId = String(data.stepId ?? `${stepsById.size}`);
        stepsById.set(stepId, {
          toolName: String(data.toolName ?? 'unknown'),
          args: asRecord(data.args),
          ok: true,
        });
        break;
      }
      case 'tool_step_result': {
        const stepId = String(data.stepId ?? '');
        const call = stepsById.get(stepId);
        if (call) {
          call.ok = data.ok !== false;
          if (typeof data.summary === 'string') call.summary = data.summary;
          call.result = asRecord(data.result);
        }
        break;
      }
      case 'sharepic_complete': {
        // A real generation carries variants and no error.
        if (!data.error && Array.isArray(data.variants) && data.variants.length > 0) {
          trace.sharepicGenerated = true;
        }
        break;
      }
      case 'image_complete': {
        if (!data.error) trace.imageGenerated = true;
        break;
      }
      case 'text_delta': {
        if (typeof data.text === 'string') trace.fullText += data.text;
        break;
      }
      case 'done': {
        sawDone = true;
        if (Array.isArray(data.citations)) {
          trace.citations = data.citations;
          trace.sources = data.citations.length;
        }
        break;
      }
      case 'error': {
        trace.error = String((data.message ?? data.error ?? 'stream error') as string);
        break;
      }
      default:
        break;
    }
  }

  trace.toolCalls = [...stepsById.values()];
  if (!sawDone && !trace.error) trace.error = 'stream ended without a done event';
  return trace;
}

/** Convenience: raw body → trace. */
export function parseTrace(rawBody: string, latencyMs: number): ChatTrace {
  return buildTrace(parseSseEvents(rawBody), latencyMs);
}
