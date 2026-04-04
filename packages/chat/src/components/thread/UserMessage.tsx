'use client';

import { MessagePrimitive, useMessage, useMessageQuote } from '@assistant-ui/react';
import { UserMessageAttachments } from '../assistant-ui/attachment';
import { useAgentStore } from '../../stores/chatStore';

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
  const custom = message.metadata?.custom as
    | { senderId?: string; senderName?: string; roleName?: string }
    | undefined;
  const senderId = custom?.senderId;
  const storeRoleName = useAgentStore((s) =>
    s.threadMode === 'eigener' ? s.customRoleName : null
  );
  const roleName = custom?.roleName || storeRoleName;

  return (
    <MessagePrimitive.Root className="mx-auto flex w-full min-w-0 max-w-3xl justify-end">
      <div className="max-w-[85%]">
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
        <div className="rounded-3xl bg-user-bubble px-4 py-3">
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
