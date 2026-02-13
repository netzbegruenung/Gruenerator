import { useRef, useEffect, useCallback } from 'react';
import { ScrollArea, Stack, Text, Flex, ActionIcon, Divider } from '@mantine/core';
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
}

export const ChatSidebar = ({
  messages,
  currentUserId,
  onSend,
  isConnected,
  onClose,
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
    <Flex direction="column" className="chat-sidebar">
      <Flex align="center" justify="space-between" px="md" py="sm">
        <Text fw={600} size="sm">
          Chat
        </Text>
        {onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onClose}
            aria-label="Chat schließen"
            className="chat-sidebar-close"
          >
            <FiX size={16} />
          </ActionIcon>
        )}
      </Flex>

      <Divider />

      <ScrollArea
        style={{ flex: 1 }}
        viewportRef={viewportRef}
        onScrollPositionChange={checkIfAtBottom}
      >
        {messages.length === 0 ? (
          <Flex align="center" justify="center" direction="column" gap="xs" py={60}>
            <FiMessageCircle size={32} color="var(--grey-300, #bdbdbd)" />
            <Text c="dimmed" size="sm">
              Noch keine Nachrichten
            </Text>
          </Flex>
        ) : (
          <Stack gap="xs" px="sm" py="xs">
            {messages.map((msg) => (
              <ChatMessageComponent
                key={msg.id}
                message={msg}
                isOwnMessage={msg.userId === currentUserId}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>

      <ChatComposer onSend={onSend} disabled={!isConnected} />
    </Flex>
  );
};
