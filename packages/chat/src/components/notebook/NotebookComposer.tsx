'use client';

import { ComposerPrimitive, useThread } from '@assistant-ui/react';
import { ArrowUp, Square } from 'lucide-react';

import { SourceFilterDropdown, type SourceFilterCollection } from './SourceFilterDropdown';

export interface SourceFilterConfig {
  collections: SourceFilterCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}

interface NotebookComposerProps {
  placeholder?: string;
  sourceFilters?: SourceFilterConfig;
}

function SendButton() {
  return (
    <ComposerPrimitive.Send
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-30"
      aria-label="Frage senden"
    >
      <ArrowUp className="h-5 w-5" />
    </ComposerPrimitive.Send>
  );
}

function CancelButton() {
  return (
    <ComposerPrimitive.Cancel
      className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-error text-white transition-opacity"
      aria-label="Abbrechen"
    >
      <Square className="h-4 w-4" />
    </ComposerPrimitive.Cancel>
  );
}

export function NotebookComposer({
  placeholder = 'Stellen Sie eine Frage...',
  sourceFilters,
}: NotebookComposerProps) {
  const thread = useThread();

  return (
    <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ComposerPrimitive.Root className="relative mx-auto flex w-full max-w-3xl items-center rounded-3xl border border-border bg-surface">
        {sourceFilters && (
          <div className="pl-2">
            <SourceFilterDropdown
              collections={sourceFilters.collections}
              selectedIds={sourceFilters.selectedIds}
              onToggle={sourceFilters.onToggle}
              onSelectAll={sourceFilters.onSelectAll}
              onSelectNone={sourceFilters.onSelectNone}
            />
          </div>
        )}
        <ComposerPrimitive.Input
          autoFocus
          placeholder={placeholder}
          className="h-12 max-h-40 flex-grow resize-none bg-transparent p-3.5 text-foreground outline-none placeholder:text-foreground-muted"
          rows={1}
        />
        {thread.isRunning ? <CancelButton /> : <SendButton />}
      </ComposerPrimitive.Root>
    </div>
  );
}
