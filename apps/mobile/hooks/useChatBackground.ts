import { resolveChatBackground, type ChatBackgroundPreset } from '@gruenerator/shared/settings';
import { useAuthStore } from '@gruenerator/shared/stores';

import { usePreferencesStore } from '../stores/preferencesStore';

/**
 * Which chat background this device shows.
 *
 * Two sources, in this order: the choice made on this device, then the profile.
 * They exist for different reasons — the profile carries the presets web shares,
 * the device carries everything including the app-only ones, because a deployed
 * server rejects keys its own release does not know (see
 * `services/chatBackground`).
 *
 * Local first, not merged: whoever last tapped a swatch on this phone meant it.
 * A profile value still arrives for anyone who has never chosen here, which is
 * what keeps a choice made in the browser showing up in the app.
 */
export function useChatBackground(): ChatBackgroundPreset {
  const local = usePreferencesStore((s) => s.chatBackground);
  const profile = useAuthStore((s) => s.user?.chat_background);
  return resolveChatBackground(local ?? profile, 'mobile');
}
