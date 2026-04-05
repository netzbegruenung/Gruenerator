import { memo } from 'react';
import { Avatar, AvatarFallback } from '@gruenerator/ui';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import type { ChatMessage as ChatMessageType } from '../../hooks/useDocumentChat';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface ChatMessageProps {
  message: ChatMessageType;
  isOwnMessage: boolean;
}

export const ChatMessageComponent = memo(function ChatMessageComponent({
  message,
  isOwnMessage,
}: ChatMessageProps) {
  return (
    <div
      className={`flex items-start gap-xs flex-nowrap ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <Avatar size="sm" className="shrink-0">
        <AvatarFallback
          className="text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: message.userColor }}
        >
          {getInitials(message.userName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div
          className={`flex items-baseline gap-xs ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
        >
          <span className="truncate text-xs font-semibold">{message.userName}</span>
          <span className="shrink-0 text-xs text-grey-500 dark:text-grey-400">
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>

        <div
          className={`max-w-[85%] rounded-lg px-sm py-1.5 ${
            isOwnMessage
              ? 'self-end bg-secondary-100 dark:bg-secondary-800'
              : 'self-start bg-grey-100 dark:bg-grey-800'
          }`}
        >
          <span className="whitespace-pre-wrap break-words text-sm">{message.text}</span>
        </div>
      </div>
    </div>
  );
});
