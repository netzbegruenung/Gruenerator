import { useState, useCallback, useRef, useEffect } from 'react';
import { FiSend } from 'react-icons/fi';

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
}

export const ChatComposer = ({ onSend, disabled, onTypingChange }: ChatComposerProps) => {
  const [text, setText] = useState('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      if (onTypingChange) {
        onTypingChange(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => onTypingChange(false), 3000);
      }
    },
    [onTypingChange]
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (onTypingChange) {
      onTypingChange(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [text, onSend, onTypingChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const hasText = text.trim().length > 0;

  return (
    <div className="flex items-end gap-1.5 flex-nowrap px-sm py-xs border-t border-grey-200 dark:border-grey-700">
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nachricht..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none field-sizing-content rounded-full border border-grey-200 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-grey-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grey-700 dark:placeholder:text-grey-500"
        style={{ maxHeight: '6rem' }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !hasText}
        aria-label="Senden"
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          hasText
            ? 'bg-primary-600 text-white hover:bg-primary-700'
            : 'text-grey-400 hover:bg-grey-100 dark:text-grey-500 dark:hover:bg-grey-800'
        }`}
      >
        <FiSend size={15} />
      </button>
    </div>
  );
};
