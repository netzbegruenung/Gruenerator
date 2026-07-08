'use client';

import { GrueneratorThread } from '@gruenerator/chat';

import { DocAiEditToggle } from '../docs/DocAiEditToggle';

import { usePresentationsChat } from './PresentationsChatProvider';

import type { ReactNode } from 'react';

function PresentationsChatStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
      {children}
    </div>
  );
}

export function PresentationsAssistantChat() {
  const state = usePresentationsChat();

  if (state.status === 'guest') {
    return (
      <PresentationsChatStatus>
        Bitte melde dich an, um den KI-Assistenten zu nutzen.
      </PresentationsChatStatus>
    );
  }

  if (state.status === 'loading') {
    return <PresentationsChatStatus>Lade Chat...</PresentationsChatStatus>;
  }

  if (state.status === 'error') {
    return (
      <PresentationsChatStatus>
        Chat konnte nicht geladen werden: {state.error.message}
      </PresentationsChatStatus>
    );
  }

  return (
    <GrueneratorThread
      firstName={state.userName ?? null}
      density="compact"
      showToolToggles={false}
      composerSlots={{
        sendAdornment: (
          <DocAiEditToggle enabled={state.aiEditEnabled} onToggle={state.toggleAiEdit} />
        ),
      }}
    />
  );
}
