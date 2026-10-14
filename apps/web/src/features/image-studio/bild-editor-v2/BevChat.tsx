import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  SimpleImageAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { GrueneratorThread } from '@gruenerator/chat';
import { ImagePlus } from 'lucide-react';
import { useMemo } from 'react';

import { type BevVersion } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

export function captionFor(v: BevVersion, versions: readonly BevVersion[]): string {
  if (v.kind === 'upload') return `V${v.num} · Hochgeladen`;
  if (v.kind === 'create') return `V${v.num} · KI-erstellt`;
  const parent = `V${versions.find((p) => p.id === v.parentId)?.num ?? '?'}`;
  if (v.kind === 'green') return `V${v.num} · Grün verwandelt aus ${parent}`;
  if (v.kind === 'outpaint') return `V${v.num} · Vergrößert aus ${parent}`;
  if (v.kind === 'nobg') return `V${v.num} · Freigestellt aus ${parent}`;
  return `V${v.num} · Bearbeitung von ${parent}`;
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
 * the message being worked on runs at the end. Each message edits the image on the stage;
 * without one it makes a new image. Which version is shown is picked under the preview.
 */
export function BevChat({ bev }: { bev: BildEditorV2 }) {
  const { versions, active, generating, statusText, error, pendingPrompt, submit } = bev;

  const entries = useMemo(() => {
    const list: ChatEntry[] = [];
    for (const v of versions) {
      list.push(
        entry(`ask-${v.id}`, 'user', v.kind === 'upload' ? `Eigenes Bild: ${v.prompt}` : v.prompt)
      );
      list.push(entry(`reply-${v.id}`, 'assistant', captionFor(v, versions)));
    }
    if (pendingPrompt && (generating || error))
      list.push(entry('ask-pending', 'user', pendingPrompt));
    if (generating)
      list.push({ ...entry('reply-pending', 'assistant', statusText ?? ''), running: true });
    else if (error) list.push({ ...entry('reply-pending', 'assistant', error), error: true });
    return list;
  }, [versions, pendingPrompt, generating, statusText, error]);

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
      if (text.length < 3) return;
      const references = (message.attachments ?? []).flatMap((a) => (a.file ? [a.file] : []));
      void submit(text, references);
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
        showMessageActions={false}
        showRoleBadge={false}
        {...(active && { composerSlots: { sendAdornment: <AddReferenceButton /> } })}
      />
      <p role="status" className="sr-only">
        {generating ? (statusText ?? '') : ''}
      </p>
    </AssistantRuntimeProvider>
  );
}
