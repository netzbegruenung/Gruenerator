import { Badge, Button } from '@gruenerator/ui';
import { GrueneratorRealtimeVoiceAdapter } from '@gruenerator/voice';
import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  markLatestUser,
  type Status,
  type Turn,
  upsertTurn,
  useHostedVoiceAgent,
  useLvNotebooks,
  useResponseClock,
} from './useHostedVoiceAgent';

import type { RealtimeVoiceAdapter } from '@assistant-ui/react';

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

/** Mistral's hosted kit with our tools (`tools`) or one LV notebook (`notebook`). */
function HostedPanel({ variant }: { variant: 'tools' | 'notebook' }) {
  const agent = useHostedVoiceAgent();
  const lv = useLvNotebooks(variant === 'notebook');
  const [fastMode, setFastMode] = useState<'fast' | 'normal'>('fast');
  const { status } = agent;
  const error = agent.error ?? lv.error;

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
              value={lv.notebookId}
              disabled={status !== 'idle'}
              onChange={(e) => lv.setNotebookId(e.target.value)}
            >
              {lv.notebooks.map((n) => (
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
        <StartStop
          status={status}
          onStart={() =>
            void agent.start({
              variant,
              notebookId: lv.notebookId || null,
              fastMode: fastMode === 'fast',
            })
          }
          onStop={agent.stop}
        />
        {agent.agentState ? <Badge variant="outline">{agent.agentState}</Badge> : null}
        {variant === 'tools' && agent.toolNames.length > 0 ? (
          <span className="text-xs text-muted-foreground">{agent.toolNames.length} Werkzeuge</span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <TranscriptList turns={agent.turns} />
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
