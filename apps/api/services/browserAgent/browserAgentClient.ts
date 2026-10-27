/**
 * Client zum Browser-Dienst (`services/browser-agent`).
 *
 * POST `/runs` liefert einen NDJSON-Strom; die Formen spiegeln
 * `services/browser-agent/src/browser_agent/events.py` (Feldnamen snake_case,
 * die Abbildung auf camelCase passiert erst im Werkzeug).
 */

import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { RUN_TOKEN_TTL_MS, signRunToken } from './runToken.js';

const log = createLogger('BrowserAgentClient');

const stepEvent = z.object({
  type: z.literal('step'),
  n: z.number(),
  url: z.string(),
  title: z.string(),
  action: z.string(),
  target: z.string().nullable(),
  x_pct: z.number().nullable(),
  y_pct: z.number().nullable(),
  thought: z.string().nullable(),
  screenshot_jpeg_b64: z.string(),
});

const screenshotSavedEvent = z.object({
  type: z.literal('screenshot_saved'),
  file_name: z.string(),
  png_b64: z.string(),
});

const doneEvent = z.object({
  type: z.literal('done'),
  summary: z.string(),
  agent_says_success: z.boolean().nullable(),
  saved: z.array(z.string()),
  steps: z.number(),
  seconds: z.number(),
  timed_out: z.boolean(),
});

const errorEvent = z.object({ type: z.literal('error'), message: z.string() });

export const browserAgentEventSchema = z.discriminatedUnion('type', [
  stepEvent,
  screenshotSavedEvent,
  doneEvent,
  errorEvent,
]);

export type BrowserAgentEvent = z.infer<typeof browserAgentEventSchema>;

/** Der Dienst ist ausgelastet (HTTP 429). */
export class BrowserAgentBusyError extends Error {
  constructor() {
    super('Browser agent is busy');
    this.name = 'BrowserAgentBusyError';
  }
}

export interface RunBrowserAgentInput {
  runId: string;
  userId: string;
  task: string;
  startUrl: string;
  signal: AbortSignal;
}

function parseLine(line: string): BrowserAgentEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    log.warn(`Skipping invalid JSON line from browser agent (${line.length} chars)`);
    return null;
  }
  const parsed = browserAgentEventSchema.safeParse(json);
  if (!parsed.success) {
    log.warn(`Skipping browser agent event with unexpected shape: ${parsed.error.message}`);
    return null;
  }
  return parsed.data;
}

export async function* runBrowserAgent(
  input: RunBrowserAgentInput
): AsyncGenerator<BrowserAgentEvent, void, undefined> {
  const baseUrl = env.BROWSER_AGENT_URL;
  const secret = env.BROWSER_AGENT_SECRET;
  if (!baseUrl) throw new Error('BROWSER_AGENT_URL is not configured');
  if (!secret) throw new Error('BROWSER_AGENT_SECRET is not configured');

  const apiBase = (env.API_INTERNAL_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const llmToken = signRunToken({
    runId: input.runId,
    userId: input.userId,
    expiresAt: Date.now() + RUN_TOKEN_TTL_MS,
  });

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Browser-Agent-Secret': secret },
    body: JSON.stringify({
      run_id: input.runId,
      task: input.task,
      start_url: input.startUrl,
      llm_base_url: `${apiBase}/api/browser-agent/llm/v1`,
      llm_token: llmToken,
    }),
    signal: input.signal,
  });

  if (res.status === 429) {
    await res.body?.cancel();
    throw new BrowserAgentBusyError();
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Browser agent responded with HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('Browser agent returned no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const event = parseLine(line);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const rest = buffer.trim();
    if (rest) {
      const event = parseLine(rest);
      if (event) yield event;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
