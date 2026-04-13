/**
 * Auth boundary regression tests.
 *
 * Exercises the Zod schema that gates every Better Auth session user before
 * it lands in `req.user`. These tests lock in three invariants:
 *
 *   1. Happy path — a complete Better-Auth-shaped user parses cleanly and
 *      renames are applied (name → display_name, createdAt → created_at).
 *   2. SQL NULL coercion — Better Auth stores unset `additionalFields`
 *      columns as NULL but Zod's `.default()` only fires on `undefined`.
 *      The middleware walks entries and coerces null → undefined so the
 *      schema defaults apply. Without this, every new user without feature
 *      flags populated would fail to sign in.
 *   3. Schema drift → loud failure — if Better Auth or the DB ever returns
 *      the wrong type for a field, the boundary throws `ZodError` at login
 *      instead of cascading `undefined` through the render tree.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { userProfileSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/** Mirror of authMiddleware.toBetterAuthUser's null-stripping + rename logic. */
function buildParseInput(user: Record<string, unknown>) {
  const stripped = Object.fromEntries(
    Object.entries(user).map(([k, v]) => [k, v === null ? undefined : v])
  );
  return {
    ...stripped,
    display_name: user.name,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

const now = new Date();

const baseBetterAuthFields = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice Example',
  emailVerified: true,
  image: null,
  createdAt: now,
  updatedAt: now,
};

describe('userProfileSchema — happy path', () => {
  const completeUser = {
    ...baseBetterAuthFields,
    avatar_robot_id: 3,
    beta_features: { workplace: true },
    user_defaults: {},
    is_admin: false,
    first_name: 'Alice',
    last_name: 'Example',
    groups_enabled: true,
    custom_generators: true,
    database_access: false,
    collab: true,
    notebook: true,
    sharepic: true,
    anweisungen: true,
    labor_enabled: true,
    sites_enabled: true,
    chat: true,
    interactive_antrag_enabled: true,
    vorlagen: true,
    video_editor: true,
  };

  const parsed = userProfileSchema.parse(buildParseInput(completeUser));

  it('passes id and email through unchanged', () => {
    expect(parsed.id).toBe('user-1');
    expect(parsed.email).toBe('alice@example.com');
  });

  it('renames Better Auth `name` → canonical `display_name`', () => {
    expect(parsed.display_name).toBe('Alice Example');
  });

  it('preserves first_name / last_name from Better Auth additionalFields', () => {
    expect(parsed.first_name).toBe('Alice');
    expect(parsed.last_name).toBe('Example');
  });

  it('preserves is_admin as a boolean (not unknown)', () => {
    expect(parsed.is_admin).toBe(false);
  });

  it('preserves avatar_robot_id and beta_features', () => {
    expect(parsed.avatar_robot_id).toBe(3);
    expect(parsed.beta_features).toEqual({ workplace: true });
  });

  it('preserves created_at as Date', () => {
    expect(parsed.created_at).toBeInstanceOf(Date);
  });
});

describe('userProfileSchema — SQL NULL coercion', () => {
  // Simulates a freshly-provisioned user before ProfileService fills defaults.
  // Every additionalField column is stored as SQL NULL by Better Auth.
  const bareNewUser = {
    ...baseBetterAuthFields,
    id: 'user-2',
    email: 'bob@example.com',
    name: 'Bob',
    avatar_robot_id: null,
    beta_features: null,
    user_defaults: null,
    is_admin: null,
    first_name: null,
    last_name: null,
    groups_enabled: null,
    custom_generators: null,
    database_access: null,
    collab: null,
    notebook: null,
    sharepic: null,
    anweisungen: null,
    labor_enabled: null,
    sites_enabled: null,
    chat: null,
    interactive_antrag_enabled: null,
    vorlagen: null,
    video_editor: null,
  };

  const parsed = userProfileSchema.parse(buildParseInput(bareNewUser));

  it('applies `.default(1)` to missing avatar_robot_id', () => {
    expect(parsed.avatar_robot_id).toBe(1);
  });

  it('applies `.default({})` to missing beta_features and user_defaults', () => {
    expect(parsed.beta_features).toEqual({});
    expect(parsed.user_defaults).toEqual({});
  });

  it('applies `.default(false)` to feature flags', () => {
    expect(parsed.groups_enabled).toBe(false);
    expect(parsed.custom_generators).toBe(false);
    expect(parsed.vorlagen).toBe(false);
    expect(parsed.video_editor).toBe(false);
  });

  it('applies `.default(true)` to sites_enabled and interactive_antrag_enabled', () => {
    expect(parsed.sites_enabled).toBe(true);
    expect(parsed.interactive_antrag_enabled).toBe(true);
  });

  it('leaves .optional() fields undefined (no default)', () => {
    expect(parsed.first_name).toBeUndefined();
    expect(parsed.last_name).toBeUndefined();
    expect(parsed.is_admin).toBeUndefined();
  });
});

describe('userProfileSchema — missing email (prod login-loop regression)', () => {
  // Production incident: Keycloak OIDC profiles that lack the `email`
  // claim produce a Better Auth session user with `email: undefined`,
  // which earlier failed `userProfileSchema.parse(...)` with
  // `ZodError: email Required` and trapped users in a `/login → /desk`
  // redirect loop. Fixed by relaxing `email` to `.optional()` at the
  // schema level. These cases pin that behavior so the regression can
  // never ship again.

  it('accepts email: undefined when Better Auth omits the claim', () => {
    const noEmailUser = {
      id: 'user-keycloak-no-email',
      name: 'Keycloak User Without Email',
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
      // email deliberately absent — mimics mapProfileToUser seeing
      // `profile.email === undefined`
      avatar_robot_id: 1,
      beta_features: {},
      user_defaults: {},
      groups_enabled: false,
      custom_generators: false,
      database_access: false,
      collab: false,
      notebook: false,
      sharepic: false,
      anweisungen: false,
      labor_enabled: false,
      sites_enabled: true,
      chat: false,
      interactive_antrag_enabled: true,
      vorlagen: false,
      video_editor: false,
    };

    const parsed = userProfileSchema.parse(buildParseInput(noEmailUser));

    expect(parsed.email).toBeUndefined();
    expect(parsed.id).toBe('user-keycloak-no-email');
    expect(parsed.display_name).toBe('Keycloak User Without Email');
  });

  it('accepts email: null via null-stripping (SQL NULL path)', () => {
    // profiles.email is nullable, so Better Auth can return null after
    // a Drizzle select. toBetterAuthUser strips nulls to undefined and
    // the schema must accept that.
    const nullEmailUser = {
      id: 'user-null-email',
      email: null,
      name: 'User With Null Email',
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
      avatar_robot_id: 2,
      beta_features: {},
      user_defaults: {},
      groups_enabled: false,
      custom_generators: false,
      database_access: false,
      collab: false,
      notebook: false,
      sharepic: false,
      anweisungen: false,
      labor_enabled: false,
      sites_enabled: true,
      chat: false,
      interactive_antrag_enabled: true,
      vorlagen: false,
      video_editor: false,
    };

    const parsed = userProfileSchema.parse(buildParseInput(nullEmailUser));

    expect(parsed.email).toBeUndefined();
    expect(parsed.avatar_robot_id).toBe(2);
  });
});

describe('userProfileSchema — drift detection', () => {
  it('throws ZodError when a required field has the wrong type', () => {
    const drifted = {
      ...baseBetterAuthFields,
      avatar_robot_id: 'seven', // regression: backend returns string
      beta_features: {},
      user_defaults: {},
    };

    let caught: z.ZodError | undefined;
    try {
      userProfileSchema.parse(buildParseInput(drifted));
    } catch (e) {
      if (e instanceof z.ZodError) caught = e;
    }

    expect(caught).toBeInstanceOf(z.ZodError);
    expect(caught?.issues[0]?.path).toEqual(['avatar_robot_id']);
  });

  it('throws ZodError when the only truly-required field (id) is missing', () => {
    // `id` is the single hard-required field that has no `.default()` and
    // no `.optional()`. Email used to be required too but was relaxed to
    // `.optional()` after the prod login-loop incident (see the
    // "missing email" describe block above).
    const incomplete = {
      // no id
      email: 'dana@example.com',
      name: 'Dana',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      avatar_robot_id: 1,
      beta_features: {},
      user_defaults: {},
      groups_enabled: false,
      custom_generators: false,
      database_access: false,
      collab: false,
      notebook: false,
      sharepic: false,
      anweisungen: false,
      labor_enabled: false,
      sites_enabled: true,
      chat: false,
      interactive_antrag_enabled: true,
      vorlagen: false,
      video_editor: false,
    };

    let caught: z.ZodError | undefined;
    try {
      userProfileSchema.parse(buildParseInput(incomplete));
    } catch (e) {
      if (e instanceof z.ZodError) caught = e;
    }

    expect(caught).toBeInstanceOf(z.ZodError);
    const paths = caught!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('id');
    // email is optional now — MUST NOT be in the missing-field list
    expect(paths).not.toContain('email');
  });
});
