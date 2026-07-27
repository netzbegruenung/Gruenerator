import { type ChatBackground } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { chatBackgroundsFor } from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';

import { usePreferencesStore } from '../stores/preferencesStore';

/**
 * Presets the *server* will accept.
 *
 * Not a taste question — a deployment one. The API validates the body against
 * its own copy of `chatBackgroundSchema`, and "its own copy" is whatever was
 * last released, not what this branch contains. A preset added here ahead of a
 * backend deploy comes back as a validation error, which surfaced as
 * "Chat-Hintergrund konnte nicht gespeichert werden" for a choice that was
 * perfectly valid.
 *
 * Derived from `platforms` rather than listed by hand: a preset the app draws
 * and web does not is, by construction, one this repo added for the app — and
 * the ones both platforms share are the ones that have shipped. When the mesh
 * presets reach web, they reach the server in the same release, and this set
 * starts including them without an edit here.
 */
const SERVER_KNOWN = new Set<string>(chatBackgroundsFor('web').map((preset) => preset.key));

/**
 * Save the chat-start background.
 *
 * The device is written first and always; the server only when it can accept
 * the value. That order is what makes an app-only preset selectable at all, and
 * it is the right one for the shared presets too: the choice shows immediately
 * instead of after a round trip.
 *
 * A rejected round trip still throws, so a preset that *should* have reached web
 * and did not is reported rather than silently kept on one device.
 *
 * Its own endpoint rather than a field on `PUT /auth/profile` — the profile body
 * schema does not carry `chat_background`. The local user is patched on success
 * so nothing waits for a session reload; the server refreshes both session
 * caches on its side.
 */
export async function setChatBackground(background: ChatBackground): Promise<void> {
  await usePreferencesStore.getState().setChatBackground(background);

  if (!SERVER_KNOWN.has(background)) return;

  const res = await getContractsClient().userProfile.updateChatBackground({ body: { background } });
  if (res.status !== 200) {
    throw new Error('Chat-Hintergrund konnte nicht gespeichert werden.');
  }
  const { user } = useAuthStore.getState();
  if (user) useAuthStore.setState({ user: { ...user, chat_background: background } });
}
