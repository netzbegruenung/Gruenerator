'use client';

import { MessagePrimitive, useMessageQuote } from '@assistant-ui/react';
import { UserMessageAttachments } from '../assistant-ui/attachment';

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
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-3xl justify-end">
      <div className="max-w-[85%] rounded-3xl bg-user-bubble px-4 py-3">
        <UserMessageAttachments />
        <QuoteBlock />
        <div className="whitespace-pre-wrap text-foreground">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
