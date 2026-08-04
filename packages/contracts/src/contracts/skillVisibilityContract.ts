/**
 * ts-rest contract for Rezepte (skill) visibility.
 *
 * `getVisibility` is public (any authenticated user) — every discovery
 * surface (Agentura, SkillLibraryModal, PlusMenu, mentionables) reads it to
 * filter the static `SKILLS` registry. `list`/`setHidden` are admin-gated and
 * back the admin UI that curates which Rezepte a deployment offers.
 *
 * Hiding a Rezept only affects discovery — `resolveSkillMention` stays
 * unfiltered, so an existing `@mention`/link keeps resolving (same
 * hidden-≠-blocked principle as the instance content policy).
 */
import { initContract } from '@ts-rest/core';

import {
  skillVisibilityResponseSchema,
  adminSkillListResponseSchema,
  adminSkillSuccessResponseSchema,
  adminSkillErrorResponseSchema,
  setSkillHiddenBodySchema,
} from '../schemas/adminSkills.js';

const c = initContract();

export const skillVisibilityContract = c.router(
  {
    /**
     * GET /api/skills/visibility
     * `mention`s an admin has hidden from discovery on this deployment.
     */
    getVisibility: {
      method: 'GET',
      path: '/api/skills/visibility',
      responses: {
        200: skillVisibilityResponseSchema,
        401: adminSkillErrorResponseSchema,
        500: adminSkillErrorResponseSchema,
      },
      summary: 'Get hidden Rezept mentions for this deployment',
    },

    /**
     * GET /api/auth/admin/skills
     * All Rezepte with their current visibility, for the admin UI.
     */
    list: {
      method: 'GET',
      path: '/api/auth/admin/skills',
      responses: {
        200: adminSkillListResponseSchema,
        401: adminSkillErrorResponseSchema,
        403: adminSkillErrorResponseSchema,
        500: adminSkillErrorResponseSchema,
      },
      summary: 'List all Rezepte with visibility status (admin)',
    },

    /**
     * PATCH /api/auth/admin/skills/:mention
     * Hide or unhide a Rezept from discovery on this deployment.
     */
    setHidden: {
      method: 'PATCH',
      path: '/api/auth/admin/skills/:mention',
      body: setSkillHiddenBodySchema,
      responses: {
        200: adminSkillSuccessResponseSchema,
        401: adminSkillErrorResponseSchema,
        403: adminSkillErrorResponseSchema,
        500: adminSkillErrorResponseSchema,
      },
      summary: 'Hide or unhide a Rezept (admin)',
    },
  },
  { pathPrefix: '' }
);
