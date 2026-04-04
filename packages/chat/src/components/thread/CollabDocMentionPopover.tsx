import { useCallback } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  ScrollArea,
} from '@gruenerator/ui';
import { getDocMentionables } from '../../lib/mentionables';

export interface CollabDocSelection {
  id: string;
  slug: string;
  title: string;
}

interface CollabDocMentionPopoverProps {
  visible: boolean;
  onSelect: (doc: CollabDocSelection) => void;
  onDismiss: () => void;
}

export function CollabDocMentionPopover({
  visible,
  onSelect,
  onDismiss,
}: CollabDocMentionPopoverProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    },
    [onDismiss]
  );

  if (!visible) return null;

  const docs = getDocMentionables().filter(
    (m) => m.identifier !== 'dokument-erstellen' && m.identifier !== 'docs-picker-trigger'
  );

  return (
    <div
      className="absolute z-50 w-72 rounded-xl border border-border bg-background shadow-lg"
      style={{ bottom: '100%', left: 0, marginBottom: '0.5rem' }}
      onKeyDown={handleKeyDown}
    >
      <Command className="rounded-xl">
        <CommandInput placeholder="Dokument suchen..." />
        <CommandList>
          <ScrollArea className="max-h-72">
            <CommandGroup heading="Kollaborative Dokumente">
              {docs.map((doc) => (
                <CommandItem
                  key={doc.identifier}
                  value={doc.title}
                  onSelect={() =>
                    onSelect({
                      id: doc.identifier,
                      slug: doc.mention,
                      title: doc.title,
                    })
                  }
                  className="flex items-center gap-2"
                >
                  <span className="text-base flex-shrink-0">📝</span>
                  <span className="truncate text-sm">{doc.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandEmpty>Keine Dokumente gefunden</CommandEmpty>
          </ScrollArea>
        </CommandList>
      </Command>
    </div>
  );
}
