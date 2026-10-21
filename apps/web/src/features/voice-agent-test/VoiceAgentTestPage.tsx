import { Badge, Button } from '@gruenerator/ui';
import { GrueneratorRealtimeVoiceAdapter } from '@gruenerator/voice';
import { initSession } from '@mistralai/mistralai/extra/voice-agents/browser';
import { type AudioSessionCreateResponse } from '@mistralai/mistralai/models/components';
import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { platformFetch } from '../../utils/platformFetch';

import type { RealtimeVoiceAdapter } from '@assistant-ui/react';

interface Turn {
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

type Status = 'idle' | 'starting' | 'running';

/**
 * The response time both panels show: from the moment the user's turn is final
 * until the agent is audible. Same yardstick on both sides, so the numbers are
 * comparable — neither includes the user's own speaking time.
 */
function useResponseClock() {
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

function upsertTurn(turns: Turn[], next: Turn): Turn[] {
  const idx = turns.findIndex((t) => t.id === next.id);
  if (idx === -1) return [...turns, next];
  const copy = turns.slice();
  copy[idx] = { ...copy[idx], ...next, responseSec: copy[idx]?.responseSec ?? next.responseSec };
  return copy;
}

function markLatestUser(turns: Turn[], responseSec: number): Turn[] {
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

const ROLE_LABEL: Record<Turn['role'], string> = {
  user: 'Du',
  assistant: 'Agent',
  tool: 'Werkzeug',
};

function TranscriptList({ turns }: { turns: Turn[] }) {
  if (turns.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch nichts gesagt.</p>;
  }
  return (
    <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
      {turns.map((turn) => (
        <li
          key={turn.id}
          className={
            turn.role === 'user'
              ? 'text-muted-foreground'
              : turn.role === 'tool'
                ? 'font-mono text-xs text-muted-foreground'
                : ''
          }
        >
          <span className="font-medium">{ROLE_LABEL[turn.role]}:</span> {turn.text}
          {turn.responseSec !== undefined ? (
            <Badge variant="outline" className="ml-2">
              Antwort nach {turn.responseSec.toFixed(1).replace('.', ',')} s
            </Badge>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-28 text-muted-foreground">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={option.value === value ? 'default' : 'outline'}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function StartStop({
  status,
  onStart,
  onStop,
}: {
  status: Status;
  onStart: () => void;
  onStop: () => void;
}) {
  if (status === 'idle') {
    return (
      <Button onClick={onStart}>
        <Mic className="h-4 w-4" /> Gespräch starten
      </Button>
    );
  }
  return (
    <Button variant="outline" onClick={onStop}>
      {status === 'starting' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Square className="h-4 w-4" />
      )}{' '}
      Beenden
    </Button>
  );
}

/** Our pipeline: Voxtral Realtime → chat graph → Kugel or Voxtral TTS. */
function PipelinePanel() {
  const [tts, setTts] = useState<'kugel' | 'voxtral'>('kugel');
  const [turnDetection, setTurnDetection] = useState<'server' | 'client'>('server');
  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<RealtimeVoiceAdapter.Mode>('listening');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeVoiceAdapter.Session | null>(null);
  const clock = useResponseClock();

  useEffect(() => () => sessionRef.current?.disconnect(), []);

  const start = () => {
    setTurns([]);
    setError(null);
    setStatus('starting');
    const adapter = new GrueneratorRealtimeVoiceAdapter({
      ttsProvider: tts,
      turnDetection,
      onError: (reason, err) => setError(`${reason}: ${String(err)}`),
    });
    const session = adapter.connect({});
    sessionRef.current = session;

    // The adapter's transcript items carry no id: a turn is open until it
    // arrives final, so the counter moves on after each final item.
    let turnNo = 0;
    let modeNow: RealtimeVoiceAdapter.Mode = 'listening';
    let waitingForAudio = false;
    session.onTranscript((item) => {
      // Fixed before the updater runs: React applies it later, after `turnNo++`.
      const turn: Turn = { id: `t${turnNo}`, role: item.role, text: item.text };
      setTurns((prev) => upsertTurn(prev, turn));
      if (item.isFinal) {
        turnNo++;
        if (item.role === 'user') {
          clock.userDone();
          waitingForAudio = true;
        }
      }
    });
    session.onModeChange((m) => {
      modeNow = m;
      setMode(m);
    });
    // In speaking mode the volume comes from the TTS playback queue, so the
    // first value above zero is the first audible sample.
    session.onVolumeChange((v) => {
      if (!waitingForAudio || modeNow !== 'speaking' || v <= 0) return;
      waitingForAudio = false;
      const sec = clock.agentAudible();
      if (sec !== undefined) setTurns((prev) => markLatestUser(prev, sec));
    });
    session.onStatusChange((s) => {
      if (s.type === 'running') setStatus('running');
      if (s.type === 'ended') {
        setStatus('idle');
        sessionRef.current = null;
        if (s.reason === 'error') setError((prev) => prev ?? String(s.error ?? 'Fehler'));
      }
    });
  };

  const stop = () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setStatus('idle');
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-grey-200 p-4 dark:border-grey-700">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">B · Eigene Pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Voxtral Realtime → unser Chat (Agents, Notebooks, Werkzeuge) → Sprachausgabe nach Wahl.
          EU-Endpunkt.
        </p>
      </header>
      <Choice
        label="Stimme"
        value={tts}
        onChange={setTts}
        disabled={status !== 'idle'}
        options={[
          { value: 'kugel', label: 'KugelAudio' },
          { value: 'voxtral', label: 'Voxtral TTS 3 (Heidi)' },
        ]}
      />
      <Choice
        label="Turn-Ende"
        value={turnDetection}
        onChange={setTurnDetection}
        disabled={status !== 'idle'}
        options={[
          { value: 'server', label: 'Voxtral 3 (Server)' },
          { value: 'client', label: 'Voxtral 2 + Lautstärke' },
        ]}
      />
      <div className="flex items-center gap-3">
        <StartStop status={status} onStart={start} onStop={stop} />
        {status === 'running' ? (
          <Badge variant="outline">{mode === 'speaking' ? 'spricht' : 'hört zu'}</Badge>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <TranscriptList turns={turns} />
    </section>
  );
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

/** The first notebook this voice search is tried on. */
const DEFAULT_NOTEBOOK_ID = 'berlin-notebook';

interface LvNotebook {
  id: string;
  name: string;
}

function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * Mistral's hosted kit: Mistral Small answers, Voxtral speaks, LiveKit carries
 * audio. Tool calls arrive here and are forwarded to our API, which runs them
 * with the chat's executors (`tools`) or asks one LV notebook (`notebook`).
 */
function HostedPanel({ variant }: { variant: 'tools' | 'notebook' }) {
  const [status, setStatus] = useState<Status>('idle');
  const [agentState, setAgentState] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [notebooks, setNotebooks] = useState<LvNotebook[]>([]);
  const [notebookId, setNotebookId] = useState('');
  const [fastMode, setFastMode] = useState<'fast' | 'normal'>('fast');
  const closeRef = useRef<(() => Promise<void>) | null>(null);
  const clock = useResponseClock();

  useEffect(() => () => void closeRef.current?.(), []);

  useEffect(() => {
    if (variant !== 'notebook') return;
    let cancelled = false;
    platformFetch('/api/voice/agent-session/notebooks', { credentials: 'include' })
      .then((res) => res.json() as Promise<{ notebooks: LvNotebook[] }>)
      .then(({ notebooks: list }) => {
        if (cancelled) return;
        setNotebooks(list);
        setNotebookId(
          (current) =>
            current || list.find((n) => n.id === DEFAULT_NOTEBOOK_ID)?.id || list[0]?.id || ''
        );
      })
      .catch(() => !cancelled && setError('Notebook-Liste nicht ladbar'));
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const start = async () => {
    setTurns([]);
    setError(null);
    setStatus('starting');
    try {
      // Created before initSession: the handlers have to exist up front, and
      // only our server knows which tools it declared.
      const res = await platformFetch('/api/voice/agent-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: variant,
          notebookId: variant === 'notebook' ? notebookId : null,
        }),
      });
      if (!res.ok) throw new Error(`Sitzung: HTTP ${res.status}`);
      const created = (await res.json()) as CreatedSession;
      setToolNames(created.toolNames);

      let toolNo = 0;
      const handlers = Object.fromEntries(
        created.toolNames.map((name) => [
          name,
          async (args: Record<string, unknown>) => {
            const id = `tool${toolNo++}`;
            setTurns((prev) => upsertTurn(prev, { id, role: 'tool', text: `${name} …` }));
            const call = await platformFetch(
              `/api/voice/agent-session/tools/${encodeURIComponent(name)}`,
              {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args, notebookId, fastMode: fastMode === 'fast' }),
              }
            );
            const body = (await call.json()) as { result?: string; error?: string; ms?: number };
            const label = `${name}(${JSON.stringify(args).slice(0, 80)})`;
            setTurns((prev) =>
              upsertTurn(prev, {
                id,
                role: 'tool',
                text: body.ms !== undefined ? `${label} · ${formatSec(body.ms)}` : label,
              })
            );
            return body.result ?? body.error ?? 'Kein Ergebnis.';
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
      session.on('disconnected', () => {
        setStatus('idle');
        setAgentState(null);
        closeRef.current = null;
      });

      await session.connect();
      setStatus('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('idle');
    }
  };

  const stop = () => {
    void closeRef.current?.();
    closeRef.current = null;
    setStatus('idle');
    setAgentState(null);
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-grey-200 p-4 dark:border-grey-700">
      <header className="flex flex-col gap-1">
        {variant === 'tools' ? (
          <>
            <h2 className="text-lg font-semibold">A · Mistral-Kit mit unseren Werkzeugen</h2>
            <p className="text-sm text-muted-foreground">
              Mistral Small antwortet und ruft unsere Chat-Werkzeuge auf (Suche, Notebooks,
              Dokumente, Bundestag …). Ohne Erstell-Werkzeuge. Stimme fest Voxtral (Heidi).
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">C · Notebook-Sprachsuche</h2>
            <p className="text-sm text-muted-foreground">
              Mistral-Kit mit genau einem Werkzeug: Fragen an ein Landesverbands-Notebook.
            </p>
          </>
        )}
        <p className="text-sm text-destructive">
          Läuft über Mistrals globalen Endpunkt — auch die Werkzeug-Ergebnisse.
        </p>
      </header>
      {variant === 'notebook' ? (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-28 text-muted-foreground">Notebook</span>
            <select
              className="rounded-md border border-grey-200 bg-background px-2 py-1 dark:border-grey-700"
              value={notebookId}
              disabled={status !== 'idle'}
              onChange={(e) => setNotebookId(e.target.value)}
            >
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <Choice
            label="Notebook-Route"
            value={fastMode}
            onChange={setFastMode}
            disabled={status !== 'idle'}
            options={[
              { value: 'fast', label: 'Schnell' },
              { value: 'normal', label: 'Normal' },
            ]}
          />
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <StartStop status={status} onStart={() => void start()} onStop={stop} />
        {agentState ? <Badge variant="outline">{agentState}</Badge> : null}
        {variant === 'tools' && toolNames.length > 0 ? (
          <span className="text-xs text-muted-foreground">{toolNames.length} Werkzeuge</span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <TranscriptList turns={turns} />
    </section>
  );
}

const VoiceAgentTestPage = () => (
  <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">Sprachagent im Vergleich</h1>
      <p className="text-sm text-muted-foreground">
        Interne Testseite. Die Zahl hinter jeder Antwort ist die Zeit vom Ende deines Satzes, bis
        der Agent hörbar wird. Kopfhörer benutzen. Ins Wort fallen kann man A und C — Pipeline B
        hört nicht zu, solange sie spricht.
      </p>
    </header>
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <PipelinePanel />
      <HostedPanel variant="tools" />
      <HostedPanel variant="notebook" />
    </div>
  </main>
);

export default VoiceAgentTestPage;
