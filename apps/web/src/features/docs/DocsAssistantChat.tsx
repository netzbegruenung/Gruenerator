'use client';

import { GrueneratorThread } from '@gruenerator/chat';

import { DocAiEditToggle } from './DocAiEditToggle';
import { DocsQuickActions } from './DocsQuickActions';
import { useDocsChat } from './DocsChatProvider';
import { SelectionChip } from './SelectionChip';

export function DocsAssistantChat() {
  const state = useDocsChat();

  if (state.status === 'guest') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Bitte melde dich an, um den KI-Assistenten zu nutzen.
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Lade Chat...
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
        Chat konnte nicht geladen werden: {state.error.message}
      </div>
    );
  }

  return (
    <GrueneratorThread
      firstName={state.userName ?? null}
      density="compact"
      showMentions={false}
      showPlusMenu={false}
      showToolToggles={false}
      showModelPicker={false}
      composerSlots={{
        aboveInput: <SelectionChip documentId={state.documentId} />,
        belowInput: <DocsQuickActions documentId={state.documentId} />,
        sendAdornment: (
          <DocAiEditToggle enabled={state.aiEditEnabled} onToggle={state.toggleAiEdit} />
        ),
      }}
    />
  );
}
