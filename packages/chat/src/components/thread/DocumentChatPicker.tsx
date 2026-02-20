'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { useFileMentionData } from '../../hooks/useFileMentionData';
import type { UserDocumentItem, UserTextItem } from '../../lib/documentMentionables';

interface DocumentChatPickerProps {
  visible: boolean;
  onConfirm: (ids: string[]) => void;
  onDismiss: () => void;
}

export function DocumentChatPicker({ visible, onConfirm, onDismiss }: DocumentChatPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { documents, texts, loadingContent, fetchCombinedContent } = useFileMentionData();

  useEffect(() => {
    if (visible) {
      fetchCombinedContent();
      setSelectedIds(new Set());
    }
  }, [visible, fetchCombinedContent]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedIds.size === 0) return;
    onConfirm([...selectedIds]);
  }, [selectedIds, onConfirm]);

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

  return (
    <div
      className="absolute z-50 w-80 rounded-xl border border-border bg-background shadow-lg"
      style={{ bottom: '100%', left: 0, marginBottom: '0.5rem' }}
      onKeyDown={handleKeyDown}
    >
      <Command className="rounded-xl">
        <CommandInput placeholder="Dokumente suchen..." />
        <CommandList>
          <ScrollArea className="max-h-72">
            {loadingContent ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                {documents.length > 0 && (
                  <CommandGroup heading="Dokumente">
                    {documents.slice(0, 15).map((doc: UserDocumentItem) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.title}
                        onSelect={() => toggleSelection(doc.id)}
                        className="flex items-center gap-2"
                      >
                        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-border">
                          {selectedIds.has(doc.id) && <Check className="h-3 w-3 text-primary" />}
                        </div>
                        <span className="text-base flex-shrink-0">📄</span>
                        <span className="truncate text-sm">{doc.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {texts.length > 0 && (
                  <CommandGroup heading="Gespeicherte Texte">
                    {texts.slice(0, 15).map((text: UserTextItem) => (
                      <CommandItem
                        key={text.id}
                        value={text.title}
                        onSelect={() => toggleSelection(text.id)}
                        className="flex items-center gap-2"
                      >
                        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-border">
                          {selectedIds.has(text.id) && <Check className="h-3 w-3 text-primary" />}
                        </div>
                        <span className="text-base flex-shrink-0">📝</span>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="truncate text-sm">{text.title}</span>
                          <Badge variant="secondary" className="flex-shrink-0 text-xs">
                            {text.documentType}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {documents.length === 0 && texts.length === 0 && (
                  <div className="p-4 text-center text-sm text-foreground-muted">
                    Keine Dokumente vorhanden
                  </div>
                )}
              </>
            )}
            <CommandEmpty>Keine Ergebnisse gefunden</CommandEmpty>
          </ScrollArea>
        </CommandList>
      </Command>

      {selectedIds.size > 0 && (
        <div className="border-t border-border p-2">
          <button
            onClick={handleConfirm}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Chat starten ({selectedIds.size} Dokument{selectedIds.size !== 1 ? 'e' : ''})
          </button>
        </div>
      )}
    </div>
  );
}
