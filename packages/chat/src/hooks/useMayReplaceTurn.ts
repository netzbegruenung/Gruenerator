import { useAuiState } from '@assistant-ui/react';

import { useCurrentUserId } from '../context/CurrentUserContext';

interface SenderMessage {
  role: string;
  metadata?: unknown;
}

function senderOf(message: SenderMessage | undefined): string | null {
  const id = (message?.metadata as { custom?: { senderId?: unknown } } | undefined)?.custom
    ?.senderId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Edit and regenerate replace the sender's own user message — in a team chat
 * the server refuses them on a teammate's turn (`not_your_message`), so the UI
 * hides them. Messages without a `senderId` (private chats, legacy rows) stay
 * editable. For an assistant message the relevant sender is the user message
 * right before it.
 */
export function mayReplaceTurn(
  messages: readonly SenderMessage[],
  messageId: string,
  currentUserId: string | null
): boolean {
  if (!currentUserId) return true;
  const index = messages.findIndex((m) => (m as { id?: string }).id === messageId);
  if (index < 0) return true;
  const message = messages[index];
  let userMessage: SenderMessage | undefined = message;
  if (message.role !== 'user') {
    userMessage = undefined;
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMessage = messages[i];
        break;
      }
    }
  }
  const sender = senderOf(userMessage);
  if (sender && sender !== currentUserId) return false;
  // Editing cuts the thread from this message on: a teammate's later message
  // would go with it, and the server refuses that.
  if (message.role === 'user') {
    for (let i = index + 1; i < messages.length; i++) {
      const later = messages[i].role === 'user' ? senderOf(messages[i]) : null;
      if (later && later !== currentUserId) return false;
    }
  }
  return true;
}

export function useMayReplaceTurn(): boolean {
  const currentUserId = useCurrentUserId();
  return useAuiState((s) =>
    mayReplaceTurn(s.thread.messages as readonly SenderMessage[], s.message.id, currentUserId)
  );
}
