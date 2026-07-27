import { Platform } from 'react-native';

import type { User } from '@gruenerator/shared';

/**
 * Emulator markers in Android's build fingerprint, measured on the two devices
 * this has to tell apart:
 *
 *   Emulator  google/sdk_gphone64_arm64/emu64a:15/…/userdebug/dev-keys
 *   Galaxy    samsung/e1sxeea/e1s:16/…/user/release-keys
 *
 * Matched on the PRODUCT markers rather than the signing keys: a rooted phone
 * can carry test-keys, but it never calls itself `sdk_gphone`.
 */
const ANDROID_EMULATOR = /generic|sdk_gphone|emulator|goldfish|ranchu|vbox|emu\d/i;

/**
 * Whether this is a throwaway sandbox rather than somebody's phone.
 *
 * Positive confirmation only, and two independent signals at that: an emulator
 * product marker AND a build that is not signed with release keys. Anything we
 * cannot identify as an emulator counts as real hardware, so the failure mode is
 * "a simulator asks you to log in" and never "a real phone silently runs as a
 * fake user".
 *
 * iOS is therefore always false: React Native exposes no simulator marker, and
 * `expo-device` (`Device.isDevice`) is not a dependency here. Installing it is
 * the one-line fix should the iOS simulator ever need the bypass — deliberately
 * left undone rather than papered over with a guess.
 */
export function isEmulator(): boolean {
  if (Platform.OS !== 'android') return false;
  const constants = Platform.constants as
    { Fingerprint?: string; Model?: string; Brand?: string } | undefined;
  const fingerprint = constants?.Fingerprint ?? '';
  const identity = `${fingerprint} ${constants?.Model ?? ''} ${constants?.Brand ?? ''}`;
  return ANDROID_EMULATOR.test(identity) && !/release-keys/i.test(fingerprint);
}

/**
 * DEV-ONLY login bypass for emulator/simulator testing (Tier 1: UI shell).
 *
 * When `EXPO_PUBLIC_DEV_AUTH_BYPASS=true` is set in `apps/mobile/.env` (gitignored),
 * the app seeds {@link DEV_BYPASS_USER} into the auth store so it renders past the
 * gate in `app/_layout.tsx` without going through Keycloak, and API auth-clearing on
 * 401 is suppressed so data-fetch failures don't bounce back to login. No backend is
 * required — data sections simply render empty. Mirrors the web E2E bypass
 * (`apps/web/src/hooks/useAuth.ts`) and shares the backend's synthetic-user UUID.
 *
 * Three gates, each of which alone is enough to keep it off:
 *
 * 1. `__DEV__` — `false` in every release/production bundle regardless of env, so
 *    the bypass can never activate in a shipped app. `EXPO_PUBLIC_*` is inlined at
 *    build time, and without this a stray `.env` on the build machine would bake
 *    the flag into a release bundle.
 * 2. the env flag — opt-in per checkout, never committed.
 * 3. {@link isEmulator} — the header of this file always claimed "emulator", but
 *    until this gate existed nothing enforced it: a dev client installed on a real
 *    phone is just as `__DEV__` as one on an emulator, and ran as the fake user.
 *
 * The Node test lane pins gate 1 by defining `__DEV__: false` (see vitest.config.ts);
 * `devAuth.vitest.ts` pins the other two.
 */
export const DEV_AUTH_BYPASS =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true' && isEmulator();

export const DEV_BYPASS_USER: User = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'dev@gruenerator.de',
  display_name: 'Development User',
  avatar_robot_id: '1',
  locale: 'de-DE',
};
