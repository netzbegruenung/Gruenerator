import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { GrueneratorThread } from '@gruenerator/chat';
import { ImagePlus } from 'lucide-react';
import { useMemo } from 'react';

import { photosOf, SharepicPhotoAttachmentAdapter } from './sharepicPhotoAttachments';
import { type CreatorPhoto } from './sharepicPhotos';
import { type CreatorMessage, type CreatorPhase } from './useSharepicCreator';

export const WORKING: Partial<Record<CreatorPhase, string>> = {
  drafting: 'Entwerfe …',
  checking: 'Prüfe den Entwurf …',
};

// One row per thread message. A reply is keyed by the user turn it answers, so
// the running placeholder and the reply that replaces it share an id: the
// external store updates the message in place instead of keeping the
// placeholder around as a sibling branch.
interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error: boolean;
  running: boolean;
}

function toEntries(messages: CreatorMessage[], status: string | null): ChatEntry[] {
  const entries = messages.map((m, i): ChatEntry => {
    const previous = messages[i - 1];
    return {
      id: m.role === 'assistant' && previous ? `reply-${previous.id}` : String(m.id),
      role: m.role,
      text: m.text,
      error: m.error === true,
      running: false,
    };
  });
  const last = messages.at(-1);
  if (status && last) {
    entries.push({
      id: `reply-${last.id}`,
      role: 'assistant',
      text: status,
      error: false,
      running: true,
    });
  }
  return entries;
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

interface SharepicCreatorChatProps {
  messages: CreatorMessage[];
  phase: CreatorPhase;
  onSend: (text: string, photos: CreatorPhoto[]) => void;
  /** A photo that could not be uploaded — said in the conversation. */
  onPhotoError: (message: string) => void;
}

/** Opens the file picker; the adapter takes it from there. Paste works too. */
function AddPhotoButton() {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <button
        type="button"
        aria-label="Foto anhängen"
        title="Eigenes Foto anhängen"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
      </button>
    </ComposerPrimitive.AddAttachment>
  );
}

export function SharepicCreatorChat({
  messages,
  phase,
  onSend,
  onPhotoError,
}: SharepicCreatorChatProps) {
  const status = WORKING[phase] ?? null;

  const threadMessages = useMemo(() => toEntries(messages, status), [messages, status]);
  const attachments = useMemo(() => new SharepicPhotoAttachmentAdapter(), []);

  // No onReload/onEdit/onCancel: a turn here is a fresh draft request, so the
  // thread hides regenerate and edit and keeps stop disabled.
  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage,
    isRunning: status !== null,
    adapters: { attachments },
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim();
      const { photos, errors } = photosOf(message.attachments ?? []);
      errors.forEach(onPhotoError);
      // A photo alone is a request too: "mach was draus".
      if (text.length >= 3 || photos.length) onSend(text, photos);
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
        composerSlots={{ sendAdornment: <AddPhotoButton /> }}
      />
      <p role="status" className="sr-only">
        {status ?? ''}
      </p>
    </AssistantRuntimeProvider>
  );
}
