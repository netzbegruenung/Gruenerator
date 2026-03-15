import { useRef, useEffect, useCallback } from 'react';
import { FiX, FiMessageCircle } from 'react-icons/fi';
import { ChatMessageComponent } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import type { ChatMessage } from '../../hooks/useDocumentChat';
import './ChatSidebar.css';

interface ChatSidebarProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  onSend: (text: string) => void;
  isConnected: boolean;
  onClose?: () => void;
  hideHeader?: boolean;
  typingUsers?: string[];
  onTypingChange?: (isTyping: boolean) => void;
}

export const ChatSidebar = ({
  messages,
  currentUserId,
  onSend,
  isConnected,
  onClose,
  hideHeader = false,
  typingUsers,
  onTypingChange,
}: ChatSidebarProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const checkIfAtBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    isAtBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current && viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, []);

  return (
    <div className="chat-sidebar flex flex-col">
      {!hideHeader && (
        <>
          <div className="flex items-center justify-between px-md py-sm">
            <span className="text-sm font-semibold">Chat</span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Chat schließen"
                className="chat-sidebar-close items-center justify-center rounded p-1 text-grey-500 hover:bg-grey-100 hover:text-grey-700 dark:text-grey-400 dark:hover:bg-grey-800 dark:hover:text-grey-200"
              >
                <FiX size={16} />
              </button>
            )}
          </div>

          <hr className="border-grey-200 dark:border-grey-700" />
        </>
      )}

      <div ref={viewportRef} onScroll={checkIfAtBottom} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-xs py-[60px]">
            <FiMessageCircle size={32} className="text-grey-300" />
            <span className="text-sm text-grey-500 dark:text-grey-400">Noch keine Nachrichten</span>
          </div>
        ) : (
          <div className="flex flex-col gap-xs px-sm py-xs">
            {messages.map((msg) => (
              <ChatMessageComponent
                key={msg.id}
                message={msg}
                isOwnMessage={msg.userId === currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      {typingUsers && typingUsers.length > 0 && (
        <span className="px-sm py-1 text-xs italic text-grey-500 dark:text-grey-400">
          {typingUsers.length === 1
            ? `${typingUsers[0]} tippt...`
            : `${typingUsers.join(' und ')} tippen...`}
        </span>
      )}

      <ChatComposer onSend={onSend} disabled={!isConnected} onTypingChange={onTypingChange} />
    </div>
  );
};
