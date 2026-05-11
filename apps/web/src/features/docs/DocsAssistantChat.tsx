'use client';

import { GrueneratorThread } from '@gruenerator/chat';
import type { ReactNode } from 'react';

import { DocAiEditToggle } from './DocAiEditToggle';
import { useDocsChat } from './DocsChatProvider';
import { SelectionChip } from './SelectionChip';

function DocsChatStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
      {children}
    </div>
  );
}

export function DocsAssistantChat() {
  const state = useDocsChat();

  if (state.status === 'guest') {
    return <DocsChatStatus>Bitte melde dich an, um den KI-Assistenten zu nutzen.</DocsChatStatus>;
  }

  if (state.status === 'loading') {
    return <DocsChatStatus>Lade Chat...</DocsChatStatus>;
  }

  if (state.status === 'error') {
    return (
      <DocsChatStatus>Chat konnte nicht geladen werden: {state.error.message}</DocsChatStatus>
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
        sendAdornment: (
          <DocAiEditToggle enabled={state.aiEditEnabled} onToggle={state.toggleAiEdit} />
        ),
      }}
    />
  );
}
