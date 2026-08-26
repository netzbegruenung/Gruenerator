/**
 * Which instance this app is configured against.
 *
 * The app ships as ONE binary for every instance, so there is no build-time
 * instance to bake in — but there *is* a build-time API origin. Expo inlines
 * `EXPO_PUBLIC_API_URL` into the bundle, and `services/chatApiUrl.ts` reads it
 * once into `CHAT_API_BASE_URL`. Resolving that origin's host therefore answers
 * "which instance am I talking to?" synchronously at module load — no network
 * round-trip, no loading state, no "first production, then corrected" flicker.
 * That is what lets `MOBILE_SYSTEM_NOTEBOOKS` stay a plain module constant.
 *
 * Mirrors `apps/web/src/config/instance.ts` and `apps/api/config/instance.ts`:
 * exactly one place per app turns environment into an instance, everything
 * downstream takes `CURRENT_INSTANCE` as a value. The shared predicates are
 * pure and know nothing about Expo, which is what lets all three reuse them.
 *
 * Deliberately NOT `services/webOrigin.ts`: that constant is the production
 * origin no matter what the app is configured against, because it feeds links
 * handed to someone else. This one has to follow the configuration.
 */
import { resolveInstance, type InstanceId } from '@gruenerator/shared/instances';

import { CHAT_API_BASE_URL } from '../services/chatApiUrl';

/**
 * `new URL()` throws on a malformed value, and a throw at module load has no
 * error boundary above it — the app would white-screen before the first frame.
 * A typo in `EXPO_PUBLIC_API_URL` therefore costs the conservative production
 * selection (via `resolveInstance`'s own fallback), not the app.
 */
function apiHostname(): string | null {
  try {
    return new URL(CHAT_API_BASE_URL).hostname;
  } catch {
    return null;
  }
}

export const CURRENT_INSTANCE: InstanceId = resolveInstance({ hostname: apiHostname() });
