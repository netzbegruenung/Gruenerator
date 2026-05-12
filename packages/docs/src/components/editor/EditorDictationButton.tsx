import { useCallback } from 'react';
import { Mic, Square } from 'lucide-react';
import { useVoxtralDictation } from '@gruenerator/voice';
import {
  type BlockNoteEditor,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from '@blocknote/core';
import { cn } from '../../lib/blockNoteUtils';

interface Props<B extends BlockSchema, I extends InlineContentSchema, S extends StyleSchema> {
  editor: BlockNoteEditor<B, I, S>;
}

export function EditorDictationButton<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>({ editor }: Props<B, I, S>) {
  const handleDelta = useCallback(
    (delta: string) => {
      if (delta) editor.insertInlineContent(delta);
    },
    [editor]
  );

  const { isDictating, toggle } = useVoxtralDictation({ onDelta: handleDelta });

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDictating ? 'Diktat stoppen' : 'Diktat starten'}
      title={isDictating ? 'Diktat stoppen' : 'Diktat starten'}
      className={cn(
        'absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors',
        isDictating
          ? 'bg-error text-white animate-pulse'
          : 'bg-background text-foreground-muted hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800'
      )}
    >
      {isDictating ? <Square size={18} /> : <Mic size={18} />}
    </button>
  );
}
