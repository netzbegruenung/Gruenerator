'use client';

import { GrueneratorThread } from '@gruenerator/chat';

import { BoardAiEditToggle } from './BoardAiEditToggle';
import { useBoardChat } from './BoardAssistantProvider';

import type { ReactNode } from 'react';

function BoardChatStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
      {children}
    </div>
  );
}

export function BoardAssistantChat() {
  const state = useBoardChat();

  if (state.status === 'guest') {
    return <BoardChatStatus>Bitte melde dich an, um den KI-Assistenten zu nutzen.</BoardChatStatus>;
  }

  if (state.status === 'loading') {
    return <BoardChatStatus>Lade Chat...</BoardChatStatus>;
  }

  if (state.status === 'error') {
    return (
      <BoardChatStatus>Chat konnte nicht geladen werden: {state.error.message}</BoardChatStatus>
    );
  }

  return (
    <GrueneratorThread
      firstName={state.userName ?? null}
      density="compact"
      showToolToggles={false}
      composerSlots={{
        sendAdornment: (
          <BoardAiEditToggle enabled={state.aiEditEnabled} onToggle={state.toggleAiEdit} />
        ),
      }}
    />
  );
}
