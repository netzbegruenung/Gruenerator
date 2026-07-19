import type { User } from '@gruenerator/shared';

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
 * `EXPO_PUBLIC_*` is inlined at build time, so a stray `.env` on the build machine could
 * otherwise bake the flag into a release bundle. The `__DEV__` gate is the hard backstop:
 * it is `false` in every release/production bundle regardless of env, so the bypass can
 * never activate in a shipped app — only under `expo start` / dev-client.
 */
export const DEV_AUTH_BYPASS = __DEV__ && process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true';

export const DEV_BYPASS_USER: User = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'dev@gruenerator.de',
  display_name: 'Development User',
  avatar_robot_id: '1',
  locale: 'de-DE',
};
