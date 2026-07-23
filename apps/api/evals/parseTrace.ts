/**
 * Pure SSE-stream → ChatTrace parser. No IO, so it unit-tests against captured
 * fixtures (parseTrace.vitest.ts) and the runner just feeds it the raw body.
 */
import { type ChatTrace, type SseEvent, type TracedToolCall } from './types.js';

/** Keys that identify an artifact in creation/edit event payloads. */
const ID_KEYS = ['id', 'documentId', 'docId', 'canvasId', 'variantId', 'targetId', 'imageId'];

function collectIds(data: Record<string, unknown>, into: string[]): void {
  for (const key of ID_KEYS) {
    const v = data[key];
    if (typeof v === 'string' && v) into.push(v);
  }
  if (Array.isArray(data.variants)) {
    for (const variant of data.variants) {
      if (variant && typeof variant === 'object') {
        collectIds(variant as Record<string, unknown>, into);
      }
    }
  }
}

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
    threadId: null,
    interrupts: [],
    artifactIds: [],
    referencedIds: [],
    warnings: [],
    editorOps: false,
    sharepicUpdated: false,
    sharepicVariants: [],
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
      case 'thread_created': {
        if (typeof data.threadId === 'string') trace.threadId = data.threadId;
        break;
      }
      case 'interrupt': {
        trace.interrupts.push({
          interruptType: String(data.interruptType ?? 'unknown'),
          ...(typeof data.question === 'string' ? { question: data.question } : {}),
        });
        if (trace.threadId == null && typeof data.threadId === 'string') {
          trace.threadId = data.threadId;
        }
        break;
      }
      case 'warning': {
        trace.warnings.push(String(data.code ?? data.message ?? 'unknown'));
        break;
      }
      case 'document_created': {
        collectIds(data, trace.artifactIds);
        break;
      }
      case 'confirm_action': {
        // A modify_doc / modify_board card is a HITL edit of a PRIOR artifact —
        // no auto-applied editor_operations/sharepic_updated event fires, so the
        // target id (a metadata row) is the only signal that this turn edits the
        // earlier doc/board. Capture it so editsPreviousArtifact can verify it.
        if (data.type === 'modify_doc' || data.type === 'modify_board') {
          const meta = Array.isArray(data.metadata) ? data.metadata : [];
          for (const row of meta) {
            const value = (row as Record<string, unknown>)?.value;
            if (typeof value === 'string' && value) trace.referencedIds.push(value);
          }
        }
        break;
      }
      case 'sharepic_updated': {
        trace.sharepicUpdated = true;
        collectIds(data, trace.referencedIds);
        break;
      }
      case 'editor_operations': {
        trace.editorOps = true;
        collectIds(data, trace.referencedIds);
        break;
      }
      case 'sharepic_complete': {
        // A real generation carries variants and no error.
        if (!data.error && Array.isArray(data.variants) && data.variants.length > 0) {
          trace.sharepicGenerated = true;
          collectIds(data, trace.artifactIds);
          for (const v of data.variants) {
            if (v && typeof v === 'object') {
              trace.sharepicVariants.push(v as Record<string, unknown>);
            }
          }
        }
        break;
      }
      case 'image_complete': {
        if (!data.error) {
          trace.imageGenerated = true;
          collectIds(data, trace.artifactIds);
        }
        break;
      }
      case 'text_delta': {
        if (typeof data.text === 'string') trace.fullText += data.text;
        break;
      }
      case 'completion': {
        // The canonical, citation-corrected final answer (notebook + agentic
        // citation-clamp path). Replaces the streamed deltas — same as the
        // frontend — so assertions see the corrected text, not the raw stream.
        const corrected = typeof data.text === 'string' ? data.text : data.answer;
        if (typeof corrected === 'string') trace.fullText = corrected;
        if (Array.isArray(data.citations)) {
          trace.citations = data.citations;
          trace.sources = data.citations.length;
        }
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
