import { Textarea, ActionIcon, Group } from '@mantine/core';
import { useState, useCallback } from 'react';
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
    <Group gap={6} align="flex-end" wrap="nowrap" p="sm">
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
        color="green"
        size="lg"
        radius="xl"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label="Senden"
      >
        <FiSend size={15} />
      </ActionIcon>
    </Group>
  );
};
