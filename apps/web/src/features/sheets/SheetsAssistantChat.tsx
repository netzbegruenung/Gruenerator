'use client';

import { GrueneratorThread } from '@gruenerator/chat';

import { DocAiEditToggle } from '../docs/DocAiEditToggle';

import { useSheetsChat } from './SheetsChatProvider';

import type { ReactNode } from 'react';

function SheetsChatStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-muted">
      {children}
    </div>
  );
}

export function SheetsAssistantChat() {
  const state = useSheetsChat();

  if (state.status === 'guest') {
    return (
      <SheetsChatStatus>Bitte melde dich an, um den KI-Assistenten zu nutzen.</SheetsChatStatus>
    );
  }

  if (state.status === 'loading') {
    return <SheetsChatStatus>Lade Chat...</SheetsChatStatus>;
  }

  if (state.status === 'error') {
    return (
      <SheetsChatStatus>Chat konnte nicht geladen werden: {state.error.message}</SheetsChatStatus>
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
