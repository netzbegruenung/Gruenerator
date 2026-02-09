import { ScrollArea, Stack, Text, Box } from '@mantine/core';
import { useRef, useEffect, useCallback } from 'react';

import { ChatComposer } from './ChatComposer';
import { ChatMessageComponent } from './ChatMessage';

import type { ChatMessage } from '../../hooks/useDocumentChat';
import './ChatSidebar.css';

interface ChatSidebarProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  onSend: (text: string) => void;
  isConnected: boolean;
}

export const ChatSidebar = ({ messages, currentUserId, onSend, isConnected }: ChatSidebarProps) => {
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
    <div className="chat-sidebar">
      <Box px="md" py="sm" className="chat-sidebar-header">
        <Text fw={600} size="sm">
          Chat
        </Text>
      </Box>

      <ScrollArea
        style={{ flex: 1 }}
        viewportRef={viewportRef}
        onScrollPositionChange={checkIfAtBottom}
      >
        {messages.length === 0 ? (
          <Box
            p="xl"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
            }}
          >
            <Text c="dimmed" size="sm">
              Noch keine Nachrichten
            </Text>
          </Box>
        ) : (
          <Stack gap={4} px="sm" py="xs">
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
    </div>
  );
};
