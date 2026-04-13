import { createLogger } from '../utils/logger.js';

const log = createLogger('BetterAuth');

/**
 * Maps a raw OIDC userinfo profile to the Better Auth user shape.
 *
 * Pure function — no I/O beyond the module-scoped winston logger — so it can
 * be unit-tested without booting the Postgres pool, Redis client, or
 * `betterAuth({...})` factory that `config/betterAuth.ts` initializes at
 * module load.
 *
 * Email handling is load-bearing: some Keycloak federated IdPs (notably
 * gruenes-netz) do not always forward an email claim. Previously the mapper
 * used `profile.email as string`, which wrote `undefined` into
 * `profiles.email` and broke every subsequent session read once the Zod
 * schema tightened. We now:
 *
 *   1. Validate the claim at runtime (typeof string + non-empty)
 *   2. Omit the `email` key entirely when the claim is missing/invalid,
 *      because `exactOptionalPropertyTypes` rejects `email: undefined`
 *   3. Emit a WARN log with `idpHint`, `sub`, `preferred_username`, and the
 *      sorted set of claim keys received — so we can diagnose which IdP is
 *      sending incomplete claims without needing to reproduce the login
 *
 * See packages/contracts/src/schemas/userProfile.ts:57-65 for the matching
 * Zod relaxation that unblocked the prod login loop (commit 7f955e55).
 */
export function mapKeycloakProfileToUser(
  profile: Record<string, unknown>,
  idpHint: string,
  locale: 'de-DE' | 'de-AT'
) {
  const rawEmail = profile.email;
  const email = typeof rawEmail === 'string' && rawEmail.length > 0 ? rawEmail : null;

  if (email === null) {
    log.warn('[BetterAuth] Keycloak profile missing email claim', {
      idpHint,
      sub: typeof profile.sub === 'string' ? profile.sub : null,
      preferredUsername:
        typeof profile.preferred_username === 'string' ? profile.preferred_username : null,
      claimKeys: Object.keys(profile).sort(),
    });
  }

  return {
    name: (profile.name as string) || (profile.preferred_username as string) || '',
    // Conditional spread — never emit `email: undefined` (exactOptionalPropertyTypes).
    // When Keycloak sends no email, the key is absent and Better Auth stores NULL.
    ...(email !== null && { email }),
    emailVerified: (profile.email_verified as boolean) ?? false,
    image: (profile.picture as string) || null,
    locale,
    authSource: `${idpHint}-login`,
  };
}
