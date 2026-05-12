'use client';

import { MessagePrimitive, useMessage, useMessageQuote } from '@assistant-ui/react';
import { UserMessageAttachments } from '../assistant-ui/attachment';
import { useAgentStore } from '../../stores/chatStore';
import { useChatDensity } from './chatDensityContext';

function QuoteBlock() {
  const quote = useMessageQuote();
  if (!quote) return null;

  return (
    <div className="mb-2 border-l-2 border-primary-300/60 pl-3 text-sm italic text-foreground-muted">
      {quote.text}
    </div>
  );
}

export function UserMessage() {
  const message = useMessage();
  const density = useChatDensity();
  const isCompact = density === 'compact';
  const custom = message.metadata?.custom as
    | { senderId?: string; senderName?: string; roleName?: string }
    | undefined;
  const senderId = custom?.senderId;
  const storeRoleName = useAgentStore((s) =>
    s.threadMode === 'eigener' ? s.customRoleName : null
  );
  const roleName = custom?.roleName || storeRoleName;

  return (
    <MessagePrimitive.Root
      className={
        isCompact
          ? 'mx-auto flex w-full min-w-0 justify-end'
          : 'mx-auto flex w-full min-w-0 max-w-3xl justify-end'
      }
    >
      <div className={isCompact ? 'max-w-[92%]' : 'max-w-[85%]'}>
        {senderId && (
          <p className="mb-1 text-right text-xs text-grey-400">
            {custom?.senderName || 'Teammitglied'}
          </p>
        )}
        {roleName && (
          <p className="mb-1 text-right text-[11px] font-medium text-primary-600 dark:text-primary-400">
            Als {roleName}
          </p>
        )}
        <div
          className={
            isCompact
              ? 'rounded-2xl bg-user-bubble px-3 py-2 text-[13px]'
              : 'rounded-3xl bg-user-bubble px-4 py-3'
          }
        >
          <UserMessageAttachments />
          <QuoteBlock />
          <div className="whitespace-pre-wrap break-words text-foreground">
            <MessagePrimitive.Parts />
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
