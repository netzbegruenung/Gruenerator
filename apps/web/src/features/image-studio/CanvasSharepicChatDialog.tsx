import { useComposerRuntime } from '@assistant-ui/react';
import {
  ChatModalDialog,
  CompactThread,
  CompactWelcome,
  NotebookChatProvider,
} from '@gruenerator/chat';
import { Leaf } from 'lucide-react';
import { HiOutlinePhoto } from 'react-icons/hi2';

import type { ChatOpenContext } from '@gruenerator/canvas-editor';

interface InsertSharepicButtonProps {
  getSharepicText: () => string;
}

function InsertSharepicButton({ getSharepicText }: InsertSharepicButtonProps) {
  const composerRuntime = useComposerRuntime();

  const handleClick = () => {
    const text = getSharepicText();
    const current = composerRuntime.getState().text;
    const prefix = current.trim().length > 0 ? `${current.trim()}\n\n` : '';
    composerRuntime.setText(`${prefix}Aktuelles Sharepic:\n${text}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 text-[10px] font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      aria-label="Aktuelles Sharepic in den Chat einfügen"
    >
      <HiOutlinePhoto className="size-3.5" aria-hidden="true" />
      Sharepic einfügen
    </button>
  );
}

const SUGGESTIONS = [
  'Wie kann ich mein Sharepic verbessern?',
  'Welche Botschaft kommt rüber?',
  'Welche Hashtags passen dazu?',
];

export interface CanvasSharepicChatDialogProps {
  context: ChatOpenContext;
  onClose: () => void;
}

export function CanvasSharepicChatDialog({ context, onClose }: CanvasSharepicChatDialogProps) {
  const collection = {
    id: 'gruene-de-system',
    name: 'gruene.de',
    linkType: 'url' as const,
  };

  return (
    <NotebookChatProvider collections={[collection]} mode="fast">
      <ChatModalDialog
        open={true}
        onClose={onClose}
        title="Sharepic-Chat"
        headerIcon={<Leaf className="size-4" />}
      >
        <CompactThread
          className="flex-1"
          assistantIcon={<Leaf className="size-4 text-primary" />}
          composerPlaceholder="Frag etwas zu deinem Sharepic..."
          welcome={
            <CompactWelcome
              icon={<Leaf className="size-6 text-primary" />}
              description="Diskutiere dein Sharepic mit der KI"
              suggestions={SUGGESTIONS}
            />
          }
          composerExtras={<InsertSharepicButton getSharepicText={context.getSharepicText} />}
        />
      </ChatModalDialog>
    </NotebookChatProvider>
  );
}
