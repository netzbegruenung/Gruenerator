import { initSession } from '@mistralai/mistralai/extra/voice-agents/browser';
import { type AudioSessionCreateResponse } from '@mistralai/mistralai/models/components';

import { type AgentSessionRequest, type HostedSessionOptions, type ToolCall } from './types';

interface CreatedSession {
  id: string;
  participantToken: string;
  serverUrl: string;
  createdAt: string;
  expiresAt: string;
  toolNames: string[];
  /** Mistral's view of the declarations, passed through for the SDK's handler check. */
  functionTools: AudioSessionCreateResponse['functionTools'];
}

export function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * Mistral's hosted kit: Mistral Small answers, Voxtral speaks, LiveKit carries
 * audio. Tool calls arrive here and are forwarded to our API, which runs them
 * with the chat's executors (`tools`) or asks one LV notebook (`notebook`).
 *
 * Returns the session unconnected, so callers register their events first.
 */
export async function openHostedSession(
  opts: HostedSessionOptions,
  request: AgentSessionRequest,
  events: { onToolStart: (call: ToolCall) => void; onToolEnd: (call: ToolCall) => void }
) {
  // Created before initSession: the handlers have to exist up front, and
  // only our server knows which tools it declared.
  const created = (await request('', {
    method: 'POST',
    body: {
      mode: opts.variant,
      notebookId: opts.variant === 'notebook' ? opts.notebookId : null,
    },
  })) as CreatedSession;

  let toolNo = 0;
  const handlers = Object.fromEntries(
    created.toolNames.map((name) => [
      name,
      async (args: Record<string, unknown>) => {
        const id = `tool${toolNo++}`;
        const label = `${name}(${JSON.stringify(args).slice(0, 80)})`;
        events.onToolStart({ id, name, label });
        let result = 'Kein Ergebnis.';
        let ms: number | undefined;
        try {
          const body = (await request(`/tools/${encodeURIComponent(name)}`, {
            method: 'POST',
            body: { args, notebookId: opts.notebookId, fastMode: opts.fastMode },
          })) as { result?: string; error?: string; ms?: number };
          result = body.result ?? body.error ?? result;
          ms = body.ms;
        } finally {
          events.onToolEnd({
            id,
            name,
            label: ms !== undefined ? `${label} · ${formatSec(ms)}` : label,
          });
        }
        return result;
      },
    ])
  );

  const session = await initSession({
    createSession: async () => ({
      ...created,
      createdAt: new Date(created.createdAt),
      expiresAt: new Date(created.expiresAt),
    }),
    deleteSession: async (id) => {
      await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    functionHandlers: handlers,
  });
  return { session, toolNames: created.toolNames };
}
