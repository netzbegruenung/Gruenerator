import { userProfileSchema, type UserProfile } from '@gruenerator/contracts';

/**
 * Frontend mirror of `apps/api/middleware/authMiddleware.ts:toBetterAuthUser`.
 *
 * Better Auth's session.user is the raw row, with `display_name` mapped to
 * `name` and standard camelCase timestamps (`createdAt` / `updatedAt`) via
 * the `fields` block in `apps/api/config/betterAuth.ts`. The other mapped
 * fields (`image`, `emailVerified`) aren't in `userProfileSchema`, so Zod
 * strips them; no consumer downstream reads them.
 *
 * `UserProfile` (defined in `@gruenerator/contracts/schemas/userProfile.ts`)
 * is the post-null-strip, snake_case shape every consumer downstream
 * expects. This adapter:
 *  1. Strips nulls → undefined so Zod `.default()` fires and optional
 *     fields resolve cleanly.
 *  2. Renames the three camelCase carry-overs back to snake_case.
 *  3. Runs `userProfileSchema.parse()` so any shape drift surfaces at
 *     the boundary instead of cascading as `undefined` through render.
 *
 * Keep this in sync with `toBetterAuthUser` — both are boundary parsers
 * for the same target type, just on opposite sides of the wire.
 */
export function sessionUserToProfile(user: Record<string, unknown>): UserProfile {
  const nullStripped = Object.fromEntries(
    Object.entries(user).map(([k, v]) => [k, v === null ? undefined : v])
  );
  return userProfileSchema.parse({
    ...nullStripped,
    display_name: user.name,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  });
}
