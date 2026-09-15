'use client';

import { ThreadPrimitive } from '@assistant-ui/react';
import { useMemo } from 'react';

import { cn } from '../../lib/utils';
import { AssistantMessage } from '../thread/AssistantMessage';
import { UserMessage } from '../thread/UserMessage';

export interface ReadonlyThreadViewProps {
  className?: string;
}

/**
 * Read-only transcript rendering: the same UserMessage/AssistantMessage
 * components as the live thread (markdown, tool cards, citations), but no
 * composer and no action bars beyond what ReadonlyModeContext allows.
 * Must be rendered inside a ReadonlyThreadProvider.
 */
export function ReadonlyThreadView({ className }: ReadonlyThreadViewProps) {
  const messageComponents = useMemo(() => ({ UserMessage, AssistantMessage }), []);

  return (
    <ThreadPrimitive.Root
      className={cn('relative flex h-full min-h-0 flex-col bg-background', className)}
    >
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="relative flex flex-grow flex-col gap-6 px-4 pt-8 pb-8 sm:px-6 lg:px-8">
          <ThreadPrimitive.Messages components={messageComponents} />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
