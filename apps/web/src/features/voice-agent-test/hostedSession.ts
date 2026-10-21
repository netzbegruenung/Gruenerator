import { initSession } from '@mistralai/mistralai/extra/voice-agents/browser';
import { type AudioSessionCreateResponse } from '@mistralai/mistralai/models/components';

import { platformFetch } from '../../utils/platformFetch';

export type HostedVariant = 'tools' | 'notebook';

export interface HostedSessionOptions {
  variant: HostedVariant;
  notebookId: string | null;
  fastMode: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Name, arguments and run time, for a debug line. */
  label: string;
}

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
  events: { onToolStart: (call: ToolCall) => void; onToolEnd: (call: ToolCall) => void }
) {
  // Created before initSession: the handlers have to exist up front, and
  // only our server knows which tools it declared.
  const res = await platformFetch('/api/voice/agent-session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: opts.variant,
      notebookId: opts.variant === 'notebook' ? opts.notebookId : null,
    }),
  });
  if (!res.ok) throw new Error(`Sitzung: HTTP ${res.status}`);
  const created = (await res.json()) as CreatedSession;

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
          const call = await platformFetch(
            `/api/voice/agent-session/tools/${encodeURIComponent(name)}`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ args, notebookId: opts.notebookId, fastMode: opts.fastMode }),
            }
          );
          const body = (await call.json()) as { result?: string; error?: string; ms?: number };
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
      await platformFetch(`/api/voice/agent-session/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    },
    functionHandlers: handlers,
  });
  return { session, toolNames: created.toolNames };
}
