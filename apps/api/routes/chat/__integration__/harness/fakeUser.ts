import { type RequestHandler } from 'express';

import { type UserProfile } from '../../../../services/user/types.js';

/**
 * The user the chat handler sees. Deliberately a test parameter rather than the
 * real `requireAuth` dev-bypass: that path demands `NODE_ENV === 'development'`
 * (authMiddleware.ts), which vitest does not set and which would change
 * behaviour in dozens of unrelated modules — and its hardcoded `DEV_BYPASS_USER`
 * has no knob for `locale`, which is a routing input (isIntentAllowedForLocale,
 * isSystemIntentAvailable, the de-AT degrade path).
 *
 * HTTP 401 is `requireAuth`'s behaviour and is covered by
 * `apps/api/middleware/authMiddleware.vitest.ts`. What the ROUTER does with a
 * missing user is an SSE `error` with `code: 'unauthorized'` at HTTP 200 — that
 * is what these tests pin, via `startChatApp({ user: null })`.
 */
export const TEST_USER: UserProfile = {
  id: '00000000-0000-4000-a000-000000000042',
  email: 'integration@example.invalid',
  display_name: 'Integration Test User',
  avatar_robot_id: 1,
  beta_features: {},
  user_defaults: {},
  default_startpage: 'chat',
  feedback_button: 'text',
  reduce_motion: false,
  reduce_transparency: false,
  show_skip_link: false,
  groups_enabled: false,
  custom_generators: false,
  database_access: false,
  collab: false,
  notebook: false,
  sharepic: false,
  anweisungen: false,
  labor_enabled: false,
  sites_enabled: false,
  chat: true,
  interactive_antrag_enabled: false,
  vorlagen: false,
  video_editor: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Sets `req.user` the way `requireAuth` would, so the real `getUser(req)` read
 * path in streamContext.ts still runs. Mocking `getUser` instead would hide how
 * the user arrives.
 */
export function userMiddleware(overrides?: Partial<UserProfile>): RequestHandler {
  return (req, _res, next) => {
    (req as unknown as { user: UserProfile }).user = { ...TEST_USER, ...overrides };
    next();
  };
}
