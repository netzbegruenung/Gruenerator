import { type HostedVariant } from '@gruenerator/voice/mistral';
import { openHostedSession } from '@gruenerator/voice/mistral/session';
import { useEffect, useRef, useState } from 'react';

import { platformFetch } from '../../utils/platformFetch';

import { agentSessionRequest } from './chatVoice';

export interface Turn {
  id: string;
  /** `tool`: a call the hosted kit made, with its run time. */
  role: 'user' | 'assistant' | 'tool';
  text: string;
  /**
   * On user turns: seconds from the end of the turn until the agent was
   * audible. Kept on the user line because the agent's line may not exist yet
   * when its first sound plays.
   */
  responseSec?: number;
}

export type Status = 'idle' | 'starting' | 'running';

/** The first notebook this voice search is tried on. */
export const DEFAULT_NOTEBOOK_ID = 'berlin-notebook';

export interface LvNotebook {
  id: string;
  name: string;
}

/**
 * The response time every panel shows: from the moment the user's turn is
 * final until the agent is audible. Same yardstick on both sides, so the
 * numbers are comparable — neither includes the user's own speaking time.
 */
export function useResponseClock() {
  const userDoneAt = useRef<number | null>(null);
  return {
    userDone: () => {
      userDoneAt.current = performance.now();
    },
    agentAudible: (): number | undefined => {
      if (userDoneAt.current === null) return undefined;
      const sec = (performance.now() - userDoneAt.current) / 1000;
      userDoneAt.current = null;
      return sec;
    },
  };
}

export function upsertTurn(turns: Turn[], next: Turn): Turn[] {
  const idx = turns.findIndex((t) => t.id === next.id);
  if (idx === -1) return [...turns, next];
  const copy = turns.slice();
  copy[idx] = { ...copy[idx], ...next, responseSec: copy[idx]?.responseSec ?? next.responseSec };
  return copy;
}

export function markLatestUser(turns: Turn[], responseSec: number): Turn[] {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.role === 'user') {
      if (turn.responseSec !== undefined) return turns;
      const copy = turns.slice();
      copy[i] = { ...turn, responseSec };
      return copy;
    }
  }
  return turns;
}

/** The LV notebooks the voice search offers, with the default preselected. */
export function useLvNotebooks(enabled: boolean) {
  const [notebooks, setNotebooks] = useState<LvNotebook[]>([]);
  const [notebookId, setNotebookId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    platformFetch('/api/voice/agent-session/notebooks', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ notebooks: LvNotebook[] }>;
      })
      .then(({ notebooks: list }) => {
        if (cancelled) return;
        setNotebooks(list);
        setNotebookId(
          (current) =>
            current || list.find((n) => n.id === DEFAULT_NOTEBOOK_ID)?.id || list[0]?.id || ''
        );
      })
      .catch((err: unknown) =>
        cancelled ? undefined : setError(`Notebook-Liste nicht ladbar (${String(err)})`)
      );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { notebooks, notebookId, setNotebookId, error };
}

/** The hosted kit (`@gruenerator/voice/mistral/session`) with the comparison page's transcript and response clock. */
export function useHostedVoiceAgent() {
  const [status, setStatus] = useState<Status>('idle');
  const [agentState, setAgentState] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const closeRef = useRef<(() => Promise<void>) | null>(null);
  const clock = useResponseClock();

  useEffect(() => () => void closeRef.current?.(), []);

  const reset = () => {
    closeRef.current = null;
    setStatus('idle');
    setAgentState(null);
  };

  const start = async (opts: {
    variant: HostedVariant;
    notebookId: string | null;
    fastMode: boolean;
  }) => {
    setTurns([]);
    setError(null);
    setStatus('starting');
    try {
      const { session, toolNames: names } = await openHostedSession(opts, agentSessionRequest, {
        onToolStart: (call) =>
          setTurns((prev) =>
            upsertTurn(prev, { id: call.id, role: 'tool', text: `${call.name} …` })
          ),
        onToolEnd: (call) =>
          setTurns((prev) => upsertTurn(prev, { id: call.id, role: 'tool', text: call.label })),
      });
      setToolNames(names);
      closeRef.current = () => session.close();

      session.on('transcript', (e) => {
        const role = e.role === 'user' ? 'user' : 'assistant';
        setTurns((prev) => upsertTurn(prev, { id: e.id, role, text: e.content }));
        if (role === 'user' && e.final) clock.userDone();
      });
      session.on('agent_state_changed', (e) => {
        setAgentState(e.state);
        if (e.state === 'speaking') {
          const sec = clock.agentAudible();
          if (sec !== undefined) setTurns((prev) => markLatestUser(prev, sec));
        }
      });
      session.on('error', (e) => setError(`${e.source}/${e.code}: ${e.message}`));
      session.on('disconnected', reset);

      await session.connect();
      setStatus('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      reset();
    }
  };

  const stop = () => {
    void closeRef.current?.();
    reset();
  };

  return { status, agentState, turns, error, toolNames, start, stop };
}
