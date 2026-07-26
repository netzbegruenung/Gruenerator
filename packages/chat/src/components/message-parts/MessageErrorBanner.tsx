import { ErrorPrimitive, MessagePrimitive } from '@assistant-ui/react';

import { useRegenerateMessage } from '../../hooks/useRegenerateMessage';

/**
 * Inline failure state for an assistant turn.
 *
 * `MessagePrimitive.Error` renders only when the message carries an error
 * status, so this costs nothing on healthy messages. Without it every failure
 * the adapter reports was invisible — the message simply stopped growing and
 * read as a short answer.
 *
 * Partial content stays rendered above this banner: a half-written answer is
 * still worth reading, it just must not look finished.
 */
export function MessageErrorBanner() {
  const regenerate = useRegenerateMessage();

  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="my-3 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3">
        <ErrorPrimitive.Message className="block text-sm text-red-700 dark:text-red-400 mb-2" />
        <button
          type="button"
          onClick={regenerate}
          className="px-3 py-1.5 text-sm rounded-full border border-primary/30 bg-background text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
        >
          Erneut versuchen
        </button>
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}
