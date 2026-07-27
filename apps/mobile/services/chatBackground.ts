import { type ChatBackground } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';

/**
 * Save the chat-start background.
 *
 * Its own endpoint rather than a field on `PUT /auth/profile` — the profile
 * body schema does not carry `chat_background`. The local user is patched on
 * success so `SunriseBackground` repaints without waiting for a session reload;
 * the server refreshes both session caches on its side.
 */
export async function setChatBackground(background: ChatBackground): Promise<void> {
  const res = await getContractsClient().userProfile.updateChatBackground({ body: { background } });
  if (res.status !== 200) {
    throw new Error('Chat-Hintergrund konnte nicht gespeichert werden.');
  }
  const { user } = useAuthStore.getState();
  if (user) useAuthStore.setState({ user: { ...user, chat_background: background } });
}
