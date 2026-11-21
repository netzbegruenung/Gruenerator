/** The fixed user the dev auth bypass signs in as. Never a real profile row. */
export const DEV_BYPASS_USER_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Extra identities a dev tab may switch to (header `x-dev-auth-user`, or the
 * `dev_auth_user` query parameter on WebSocket upgrades) — only with a valid
 * bypass token. Real profile rows, seeded by `scripts/seed-dev-group-chat.ts`.
 * `00000000-0000-4000-a000-0000000000b2` is Lena Hoffmann.
 */
export const DEV_BYPASS_EXTRA_USERS: readonly string[] = ['00000000-0000-4000-a000-0000000000b2'];

export function pickDevBypassUserId(requested: unknown): string {
  return typeof requested === 'string' && DEV_BYPASS_EXTRA_USERS.includes(requested)
    ? requested
    : DEV_BYPASS_USER_ID;
}
