import { memo } from 'react';
import { Avatar, Group, Text, Paper, Stack } from '@mantine/core';
import type { ChatMessage as ChatMessageType } from '../../hooks/useDocumentChat';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'Gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;

  return new Date(timestamp).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    <Group
      gap="xs"
      align="flex-start"
      wrap="nowrap"
      style={{ flexDirection: isOwnMessage ? 'row-reverse' : 'row' }}
    >
      <Avatar
        size={28}
        radius="xl"
        color={message.userColor}
        style={{ backgroundColor: message.userColor }}
      >
        <Text size="xs" fw={700} c="white" lh={1}>
          {getInitials(message.userName)}
        </Text>
      </Avatar>

      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Group gap="xs" align="baseline" justify={isOwnMessage ? 'flex-end' : 'flex-start'}>
          <Text size="xs" fw={600} truncate>
            {message.userName}
          </Text>
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {formatRelativeTime(message.timestamp)}
          </Text>
        </Group>

        <Paper
          px="sm"
          py={6}
          radius="lg"
          style={{
            backgroundColor: isOwnMessage
              ? 'light-dark(var(--secondary-100, #D5E1DC), var(--secondary-800, #3A5448))'
              : 'light-dark(var(--grey-100, #f3f4f6), var(--grey-800, #1f2937))',
            alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
          }}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text}
          </Text>
        </Paper>
      </Stack>
    </Group>
  );
});
