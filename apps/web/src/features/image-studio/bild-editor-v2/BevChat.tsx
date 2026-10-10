import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  SimpleImageAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { GrueneratorThread } from '@gruenerator/chat';
import { type KiLabelMode } from '@gruenerator/contracts';
import { AI_IMAGE_TRANSPARENCY, IMAGE_FORMAT_IDS } from '@gruenerator/shared/image-studio';
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { Expand, ImagePlus, Leaf, Scissors, Settings2, UserRound, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '../../../utils/cn';

import { type BevMode, type BevVersion } from './types';
import { type BildEditorV2, IMAGE_MODES } from './useBildEditorV2';

type ImageMode = Exclude<BevMode, 'erstellen'>;

/** `action` is the button for a mode that runs without text; `hint` sits next to it. */
const MODE_META: Record<
  ImageMode,
  { label: string; icon: typeof Wand2; hint: string; action?: string; needsText?: boolean }
> = {
  bearbeiten: {
    label: 'Bearbeiten',
    icon: Wand2,
    hint: 'Beschreibe, was sich ändern soll – Referenzbilder über das Bild-Symbol.',
    needsText: true,
  },
  'gruen-verwandeln': {
    label: 'Grün verwandeln',
    icon: Leaf,
    hint: 'Optional: schreib, was grüner werden soll.',
    action: 'Grün verwandeln',
  },
  vergroessern: {
    label: 'Vergrößern',
    icon: Expand,
    hint: 'Erweitert das Bild auf das Ziel-Format.',
    action: 'Vergrößern',
  },
  hintergrund: {
    label: 'Hintergrund entfernen',
    icon: Scissors,
    hint: 'Stellt das Motiv frei, der Hintergrund wird transparent.',
    action: 'Freistellen',
  },
  profilbild: {
    label: 'Profilbild',
    icon: UserRound,
    hint: 'Stellt das Foto frei und öffnet es als Profilbild im Editor.',
    action: 'Profilbild gestalten',
  },
};

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

export function captionFor(v: BevVersion, versions: readonly BevVersion[]): string {
  if (v.kind === 'upload') return `V${v.num} · Hochgeladen`;
  if (v.kind === 'create') return `V${v.num} · KI-erstellt`;
  const parent = `V${versions.find((p) => p.id === v.parentId)?.num ?? '?'}`;
  if (v.kind === 'green') return `V${v.num} · Grün verwandelt aus ${parent}`;
  if (v.kind === 'outpaint') return `V${v.num} · Vergrößert aus ${parent}`;
  if (v.kind === 'nobg') return `V${v.num} · Freigestellt aus ${parent}`;
  return `V${v.num} · Bearbeitung von ${parent}`;
}

const chip =
  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50';

function SettingsMenu({ bev }: { bev: BildEditorV2 }) {
  const { mode, settings, setSettings } = bev;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Einstellungen"
          title="Einstellungen"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={10} className="w-72">
        <div className="flex flex-col gap-4">
          {mode === 'vergroessern' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ziel-Format
              </span>
              <div className="flex flex-wrap gap-1.5">
                {IMAGE_FORMAT_IDS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={settings.aspect === a}
                    onClick={() => setSettings((s) => ({ ...s, aspect: a }))}
                    className={cn(
                      chip,
                      settings.aspect === a
                        ? 'border-primary bg-primary text-white'
                        : 'border-border text-foreground hover:bg-muted'
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div role="radiogroup" aria-label="KI-Kennzeichnung" className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              KI-Kennzeichnung
            </span>
            <div className="flex flex-col gap-1.5">
              {KI_LABEL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.kiLabel === o.id}
                  onClick={() => setSettings((s) => ({ ...s, kiLabel: o.id }))}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                      settings.kiLabel === o.id ? 'border-primary' : 'border-border'
                    )}
                  >
                    {settings.kiLabel === o.id && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-foreground">{o.label}</span>
                </button>
              ))}
            </div>
            {settings.kiLabel === 'none' && (
              <p role="status" className="text-xs leading-snug text-foreground-muted">
                {AI_IMAGE_TRANSPARENCY.labelRemovedWarning}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Above the composer: what the next message does, and a button for what needs no text. */
function ModeBar({ bev, onAction }: { bev: BildEditorV2; onAction: (label: string) => void }) {
  const { mode, setMode, generating, settings } = bev;
  if (mode === 'erstellen') return null;
  const meta = MODE_META[mode];
  const action = mode === 'vergroessern' ? `Auf ${settings.aspect} vergrößern` : meta.action;
  return (
    <div className="flex flex-col gap-2 px-1 pb-2">
      <div
        role="radiogroup"
        aria-label="Was soll passieren?"
        className="flex flex-wrap items-center gap-1.5"
      >
        <SettingsMenu bev={bev} />
        {IMAGE_MODES.map((m) => {
          const Icon = MODE_META[m as ImageMode].icon;
          const checked = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={generating}
              onClick={() => setMode(m)}
              className={cn(
                chip,
                checked
                  ? 'border-primary bg-primary/10 text-primary-700 dark:text-primary-300'
                  : 'border-border text-foreground hover:bg-muted'
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {MODE_META[m as ImageMode].label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <p className="m-0 flex-1 text-xs leading-snug text-muted-foreground">{meta.hint}</p>
        {action && (
          <button
            type="button"
            onClick={() => onAction(action)}
            disabled={generating}
            className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

function AddReferenceButton() {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <button
        type="button"
        aria-label="Referenzbild anhängen"
        title="Referenzbild anhängen"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
      </button>
    </ComposerPrimitive.AddAttachment>
  );
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error: boolean;
  running: boolean;
}

function convertMessage(entry: ChatEntry): ThreadMessageLike {
  if (entry.error) {
    return {
      id: entry.id,
      role: 'assistant',
      content: [],
      status: { type: 'incomplete', reason: 'error', error: entry.text },
    };
  }
  return {
    id: entry.id,
    role: entry.role,
    content: [{ type: 'text', text: entry.text }],
    ...(entry.running ? { status: { type: 'running' } as const } : {}),
  };
}

const entry = (id: string, role: ChatEntry['role'], text: string): ChatEntry => ({
  id,
  role,
  text,
  error: false,
  running: false,
});

/**
 * The image editor's conversation: every version is a turn (what was asked, what came of it),
 * the message being worked on runs at the end. Which version is shown is picked under the preview.
 */
export function BevChat({ bev }: { bev: BildEditorV2 }) {
  const { versions, generating, statusText, error, submit, mode } = bev;
  // The request on its way (at first the one the Studio handed over); it becomes a version, or
  // stays with the error below it.
  const [attempt, setAttempt] = useState<string | null>(bev.handoffPrompt);

  const entries = useMemo(() => {
    const list: ChatEntry[] = [];
    for (const v of versions) {
      list.push(
        entry(`ask-${v.id}`, 'user', v.kind === 'upload' ? `Eigenes Bild: ${v.prompt}` : v.prompt)
      );
      list.push(entry(`reply-${v.id}`, 'assistant', captionFor(v, versions)));
    }
    if (attempt && (generating || error)) list.push(entry('ask-pending', 'user', attempt));
    if (generating)
      list.push({ ...entry('reply-pending', 'assistant', statusText ?? ''), running: true });
    else if (error) list.push({ ...entry('reply-pending', 'assistant', error), error: true });
    return list;
  }, [versions, attempt, generating, statusText, error]);

  const run = (text: string, references: File[] = [], shown = text) => {
    setAttempt(shown);
    void submit(text, references).then((committed) => {
      if (committed) setAttempt(null);
    });
  };

  const attachments = useMemo(() => new SimpleImageAttachmentAdapter(), []);
  // No onReload/onEdit/onCancel: a turn here is a new version, so the thread hides regenerate and
  // edit and keeps stop disabled.
  const runtime = useExternalStoreRuntime({
    messages: entries,
    convertMessage,
    isRunning: generating,
    adapters: { attachments },
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim();
      const references = (message.attachments ?? []).flatMap((a) => (a.file ? [a.file] : []));
      if (mode !== 'erstellen' && MODE_META[mode].needsText && text.length < 3) return;
      if (mode === 'erstellen' && text.length < 3) return;
      run(text, references);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <GrueneratorThread
        density="compact"
        showMentions={false}
        showPlusMenu={false}
        showToolToggles={false}
        showModelPicker={false}
        composerSlots={{
          // The buttons send no text: each mode has its own instruction.
          aboveInput: <ModeBar bev={bev} onAction={(label) => run('', [], label)} />,
          ...(mode === 'bearbeiten' && { sendAdornment: <AddReferenceButton /> }),
        }}
      />
      <p role="status" className="sr-only">
        {generating ? (statusText ?? '') : ''}
      </p>
    </AssistantRuntimeProvider>
  );
}
