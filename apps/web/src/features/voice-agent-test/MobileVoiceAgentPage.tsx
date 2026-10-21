import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useVoiceControls,
  useVoiceState,
} from '@assistant-ui/react';
import { GrueneratorHomeIconLoading, VoiceOrb } from '@gruenerator/chat';
import { Mic, MicOff, Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { TOOL_LABEL } from './chatVoice';
import { type HostedVariant, type ToolCall } from './hostedSession';
import { MistralVoiceAdapter } from './MistralVoiceAdapter';
import { useLvNotebooks } from './useHostedVoiceAgent';

import { cn } from '@/utils/cn';

/** The hosted kit takes audio only; typing never starts a run here. */
const VOICE_ONLY: ChatModelAdapter = {
  run: () => Promise.reject(new Error('Hier wird nur gesprochen.')),
};

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] rounded-3xl bg-primary-100 px-4 py-2.5 text-[15px] leading-snug text-primary-900 dark:bg-primary-900/50 dark:text-primary-50">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="text-[16px] leading-relaxed text-foreground">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage };

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: HostedVariant;
  onChange: (v: HostedVariant) => void;
  disabled: boolean;
}) {
  const options: { value: HostedVariant; label: string }[] = [
    { value: 'tools', label: 'Grünerator' },
    { value: 'notebook', label: 'Notebook' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Modus"
      className="relative grid grid-cols-2 rounded-full bg-grey-200/70 p-1 dark:bg-grey-800/70"
    >
      {/* One thumb that slides, instead of two backgrounds swapping. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary-600 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          value === 'notebook' && 'translate-x-full'
        )}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative min-h-10 touch-manipulation select-none rounded-full px-4 text-sm font-medium transition-colors duration-300 disabled:opacity-60',
            value === o.value ? 'text-white' : 'text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The orb, with a turning gear on top while the agent looks something up.
 * Tapping it starts a call, as the first thing a hand reaches for.
 */
function OrbWithGear({ tool }: { tool: ToolCall | null }) {
  const voice = useVoiceState();
  const { connect } = useVoiceControls();
  const idle = voice?.status.type !== 'running' && voice?.status.type !== 'starting';
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={idle ? () => void connect() : undefined}
        aria-label={idle ? 'Gespräch starten' : undefined}
        aria-hidden={idle ? undefined : true}
        tabIndex={idle ? 0 : -1}
        className={cn(
          'relative grid touch-manipulation select-none place-items-center rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/40',
          idle
            ? 'cursor-pointer transition-transform duration-150 active:scale-[0.96]'
            : 'cursor-default'
        )}
      >
        <VoiceOrb variant="emerald" className="size-44" />
        <GrueneratorHomeIconLoading
          loading
          aria-hidden
          className={cn(
            'absolute size-12 text-white drop-shadow transition-[opacity,transform] duration-300',
            tool ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          )}
        />
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-foreground-muted">
        {tool
          ? `${TOOL_LABEL[tool.name] ?? 'Schlage nach'} …`
          : idle
            ? 'Tippe, um zu sprechen'
            : null}
      </p>
    </div>
  );
}

function CallBar() {
  const voice = useVoiceState();
  const { connect, disconnect, mute, unmute } = useVoiceControls();
  const status = voice?.status.type;
  const live = status === 'running' || status === 'starting';

  if (!live) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        className="flex min-h-14 w-full max-w-md touch-manipulation select-none items-center justify-center gap-2 rounded-full bg-primary-600 text-base font-semibold text-white shadow-lg transition-[transform,background] duration-150 active:scale-[0.97] active:bg-primary-700"
      >
        <Phone className="size-5" aria-hidden /> Gespräch starten
      </button>
    );
  }

  const muted = voice?.isMuted ?? false;
  return (
    <ComposerPrimitive.Root className="flex w-full max-w-md items-center gap-2 rounded-full border border-grey-200 bg-background py-2 pr-2 pl-5 shadow-lg dark:border-grey-700">
      <ComposerPrimitive.Input
        rows={1}
        submitMode="enter"
        enterKeyHint="send"
        placeholder={
          status === 'starting' ? 'Verbinde …' : muted ? 'Stumm – tippe hier' : 'Nachricht eingeben'
        }
        className="min-w-0 flex-1 resize-none bg-transparent text-base text-foreground placeholder:text-foreground-muted focus:outline-none"
      />
      <button
        type="button"
        onClick={() => (muted ? unmute() : mute())}
        disabled={status !== 'running'}
        aria-label={muted ? 'Mikrofon an' : 'Mikrofon aus'}
        aria-pressed={muted}
        className={cn(
          'grid size-12 touch-manipulation place-items-center rounded-full transition-[transform,background] duration-150 active:scale-[0.94] disabled:opacity-50',
          muted ? 'bg-foreground text-background' : 'bg-grey-100 text-foreground dark:bg-grey-800'
        )}
      >
        {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </button>
      <button
        type="button"
        onClick={() => disconnect()}
        aria-label="Gespräch beenden"
        className="grid size-12 touch-manipulation place-items-center rounded-full bg-primary-600 text-white transition-[transform,background] duration-150 active:scale-[0.94] active:bg-primary-700"
      >
        <X className="size-5" />
      </button>
    </ComposerPrimitive.Root>
  );
}

function VoiceScreen({
  variant,
  onVariant,
  lv,
  tool,
  error,
}: {
  variant: HostedVariant;
  onVariant: (v: HostedVariant) => void;
  lv: ReturnType<typeof useLvNotebooks>;
  tool: ToolCall | null;
  error: string | null;
}) {
  const voice = useVoiceState();
  const live = voice?.status.type === 'running' || voice?.status.type === 'starting';
  const shownError = error ?? (variant === 'notebook' ? lv.error : null);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Grünerator Sprache</h1>
          <span className="rounded-full bg-grey-200/70 px-2.5 py-1 text-[11px] text-foreground-muted dark:bg-grey-800/70">
            Intern · Test
          </span>
        </div>
        <Segmented value={variant} onChange={onVariant} disabled={live} />
        {/* Always mounted: the row folds open and shut instead of popping in. */}
        <div
          className={cn(
            '-mt-3 grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
            variant === 'notebook' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
          inert={variant !== 'notebook'}
        >
          <div className="overflow-hidden pt-3">
            <select
              aria-label="Notebook"
              value={lv.notebookId}
              disabled={live}
              onChange={(e) => lv.setNotebookId(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-grey-200 bg-background px-3 text-base disabled:opacity-60 dark:border-grey-700"
            >
              {lv.notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-4">
          <ThreadPrimitive.Empty>
            <p className="m-auto max-w-64 text-center text-sm text-foreground-muted">
              {variant === 'notebook'
                ? 'Frag das Notebook, was du wissen willst.'
                : 'Frag nach Programmen, Beschlüssen, Notebooks oder Umfragen.'}
            </p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <footer className="flex flex-col items-center gap-3 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <OrbWithGear tool={tool} />
        {shownError ? (
          <p
            role="alert"
            className="rounded-xl bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-200"
          >
            {shownError}
          </p>
        ) : null}
        <CallBar />
        {/* Kennzeichnung als KI-Dialog (Art. 50 Abs. 1 KI-VO). */}
        <p className="text-center text-[11px] leading-tight text-foreground-muted">
          Du sprichst mit einer KI. Audio läuft über Mistrals globalen Endpunkt.
        </p>
      </footer>
    </div>
  );
}

/**
 * The hosted Mistral voice agent on assistant-ui's realtime voice layer: the
 * session is a `RealtimeVoiceAdapter`, transcripts become thread messages and
 * `VoiceOrb` follows the call. Built for phones.
 */
const MobileVoiceAgentPage = () => {
  const [variant, setVariant] = useState<HostedVariant>('tools');
  const [tool, setTool] = useState<ToolCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lv = useLvNotebooks(variant === 'notebook');

  const [voice] = useState(
    () => new MistralVoiceAdapter({ onToolActivity: setTool, onError: setError })
  );
  useEffect(() => {
    voice.setSessionOptions({ variant, notebookId: lv.notebookId || null, fastMode: true });
  }, [voice, variant, lv.notebookId]);
  const runtime = useLocalRuntime(VOICE_ONLY, { adapters: { voice } });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <VoiceScreen variant={variant} onVariant={setVariant} lv={lv} tool={tool} error={error} />
    </AssistantRuntimeProvider>
  );
};

export default MobileVoiceAgentPage;
