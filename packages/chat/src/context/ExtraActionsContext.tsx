'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMessage } from '@assistant-ui/react';
import type { ChatMessageMetadata } from '../types/messageMetadata';

export interface ExtraAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export type ExtraActionFactory = (message: {
  text: string;
  metadata?: ChatMessageMetadata;
}) => ExtraAction[];

const ExtraActionsContext = createContext<ExtraActionFactory | undefined>(undefined);

export function ExtraActionsProvider({
  factory,
  children,
}: {
  factory: ExtraActionFactory;
  children: ReactNode;
}) {
  return <ExtraActionsContext.Provider value={factory}>{children}</ExtraActionsContext.Provider>;
}

export function useExtraActions(): ExtraAction[] {
  const factory = useContext(ExtraActionsContext);
  const message = useMessage();

  return useMemo(() => {
    if (!factory) return [];

    const text = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');

    const metadata = message.metadata?.custom as ChatMessageMetadata | undefined;
    return factory({ text, metadata });
  }, [factory, message.content, message.metadata?.custom]);
}
