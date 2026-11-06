'use client';

import { ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { memo } from 'react';

import { useChatDensity } from '../thread/chatDensityContext';

import type { ChatMessageMetadata } from '../../types/messageMetadata';

/**
 * Follow-up prompts under the last answer. They ride on message metadata, not on
 * a SuggestionAdapter, so each chip passes its prompt to `ThreadPrimitive.Suggestion`.
 */
export const FollowUpSuggestions = memo(function FollowUpSuggestions() {
  const isCompact = useChatDensity() === 'compact';
  const isLast = useAuiState((s) => s.message.isLast);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const suggestions = useAuiState(
    (s) => (s.message.metadata?.custom as ChatMessageMetadata | undefined)?.followUpSuggestions
  );

  if (!isLast || isRunning || !suggestions?.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((prompt) => (
        <ThreadPrimitive.Suggestion
          key={prompt}
          prompt={prompt}
          send
          className={
            isCompact
              ? 'rounded-2xl border border-border px-3 py-1.5 text-left text-[12px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              : 'rounded-2xl border border-border px-4 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          }
        >
          {prompt}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
});
