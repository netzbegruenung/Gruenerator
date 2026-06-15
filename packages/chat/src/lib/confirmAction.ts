// Shared confirm/reject flow for chat-proposed actions (save doc, modify
// board, …). Platform cards (web ConfirmActionCard, mobile ConfirmActionCard)
// render their own UI around this single POST so the protocol can't drift.

import { useChatConfigStore } from '../stores/chatConfigStore';

import type { ConfirmActionData } from '../types/messageMetadata';

export type ConfirmActionOutcome =
  | { status: 'confirmed'; url: string | null }
  | { status: 'rejected' }
  | { status: 'expired' }
  | { status: 'error'; message: string };

export async function confirmChatAction(
  action: ConfirmActionData,
  confirmed: boolean
): Promise<ConfirmActionOutcome> {
  try {
    const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
    const response = await configFetch(endpoints.chatConfirm, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: action.threadId,
        actionId: action.actionId,
        confirmed,
      }),
    });

    if (response.status === 404) return { status: 'expired' };

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      return { status: 'error', message: data?.error || 'Fehler bei der Ausführung.' };
    }

    if (!confirmed) return { status: 'rejected' };

    const data = (await response.json()) as { url?: unknown };
    return { status: 'confirmed', url: typeof data.url === 'string' ? data.url : null };
  } catch {
    return { status: 'error', message: 'Verbindungsfehler. Bitte versuche es erneut.' };
  }
}
