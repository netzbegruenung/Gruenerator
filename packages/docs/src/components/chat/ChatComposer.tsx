import { useState, useCallback } from 'react';
import { Textarea, ActionIcon, Group } from '@mantine/core';
import { FiSend } from 'react-icons/fi';

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const ChatComposer = ({ onSend, disabled }: ChatComposerProps) => {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <Group
      gap={6}
      align="flex-end"
      wrap="nowrap"
      px="sm"
      py="xs"
      style={{ borderTop: '1px solid var(--grey-200, #e5e7eb)' }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nachricht..."
        autosize
        minRows={1}
        maxRows={4}
        disabled={disabled}
        style={{ flex: 1 }}
        radius="xl"
        styles={{ input: { fontSize: 'var(--mantine-font-size-sm)', paddingRight: '0.75rem' } }}
      />
      <ActionIcon
        variant={text.trim() ? 'filled' : 'subtle'}
        size="lg"
        radius="xl"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label="Senden"
        style={text.trim() ? { backgroundColor: '#5F8575' } : undefined}
      >
        <FiSend size={15} />
      </ActionIcon>
    </Group>
  );
};
