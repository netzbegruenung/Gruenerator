/**
 * ts-rest contract for per-user learned writing styles ("angelernte Textformen").
 *
 * Covers apps/api/routes/userTextForms/userTextFormsContractRouter.ts. All routes
 * require authentication (requireAuth is applied at the /api/text-forms prefix in
 * routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  analyzeTextFormBodySchema,
  analyzeTextFormResponseSchema,
  draftRecipeBodySchema,
  mentionableTextFormsListResponseSchema,
  publicTextFormsResponseSchema,
  saveTextFormBodySchema,
  textFormDeleteResponseSchema,
  textFormDraftResponseSchema,
  textFormShareBodySchema,
  textFormShareModeBodySchema,
  textFormShareResponseSchema,
  textFormShareSettingsSchema,
  textFormErrorResponseSchema,
  textFormIsPublicBodySchema,
  textFormItemResponseSchema,
  textFormsListResponseSchema,
} from '../schemas/textForm.js';

const c = initContract();

export const userTextFormsContract = c.router(
  {
    /** GET /api/text-forms — the caller's own learned text forms. */
    list: {
      method: 'GET',
      path: '/api/text-forms',
      responses: {
        200: textFormsListResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'List the current user text forms',
    },

    /** POST /api/text-forms/analyze — distill a style block from examples. */
    analyze: {
      method: 'POST',
      path: '/api/text-forms/analyze',
      body: analyzeTextFormBodySchema,
      responses: {
        200: analyzeTextFormResponseSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Analyze example texts into an editable style block',
    },

    /**
     * POST /api/text-forms/draft — synthesize a recipe spec from a one-shot
     * freeform brief (`description`). Declared before the `:mention` routes so `draft` is not
     * swallowed as a mention.
     */
    draft: {
      method: 'POST',
      path: '/api/text-forms/draft',
      body: draftRecipeBodySchema,
      responses: {
        200: textFormDraftResponseSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Draft a recipe spec from a freeform brief',
    },

    /**
     * GET /api/text-forms/public — public Agentura discovery feed: recipes
     * listed publicly (is_public=true atop share_mode='authenticated').
     * Declared before the `:mention` routes so `public` is not swallowed.
     */
    listPublic: {
      method: 'GET',
      path: '/api/text-forms/public',
      responses: {
        200: publicTextFormsResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'List publicly-listed recipes for the Agentura directory',
    },

    /**
     * GET /api/text-forms/mentionable — recipes usable as an @-mention: the
     * caller's own plus those shared into their groups. Declared before the
     * `:mention` routes so `mentionable` is not swallowed.
     */
    listMentionable: {
      method: 'GET',
      path: '/api/text-forms/mentionable',
      responses: {
        200: mentionableTextFormsListResponseSchema,
        401: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'List recipes available as an @-mention',
    },

    /** PUT /api/text-forms/:mention — create or update a text form. */
    save: {
      method: 'PUT',
      path: '/api/text-forms/:mention',
      pathParams: z.object({ mention: z.string() }),
      body: saveTextFormBodySchema,
      responses: {
        200: textFormItemResponseSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        // `recipe`: das Rezept gehört einem Landesverband, für den die Person
        // keine Rolle hinterlegt hat.
        403: textFormErrorResponseSchema,
        409: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Create or update a user text form',
    },

    /** DELETE /api/text-forms/:mention — delete a text form. */
    remove: {
      method: 'DELETE',
      path: '/api/text-forms/:mention',
      pathParams: z.object({ mention: z.string() }),
      responses: {
        200: textFormDeleteResponseSchema,
        401: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Delete a user text form',
    },

    /**
     * GET /api/text-forms/:mention/share — current share settings. Owner only.
     * Separate from the group-share `share`/`unshare` pair below: those two
     * manage the group-share list (PUT to add, DELETE to revoke), these three
     * manage the visibility axis (share_mode / is_public), mirroring the
     * agent sharing contract's method-split.
     */
    getShareSettings: {
      method: 'GET',
      path: '/api/text-forms/:mention/share',
      pathParams: z.object({ mention: z.string() }),
      responses: {
        200: textFormShareSettingsSchema,
        401: textFormErrorResponseSchema,
        403: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Get share settings for a recipe',
    },

    /** PUT /api/text-forms/:mention/share/mode — set visibility. Owner only. */
    setShareMode: {
      method: 'PUT',
      path: '/api/text-forms/:mention/share/mode',
      pathParams: z.object({ mention: z.string() }),
      body: textFormShareModeBodySchema,
      responses: {
        200: textFormShareSettingsSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        403: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        // `sharingFailure` refuses a non-custom row (a preset / LV override is
        // not the caller's own text form to share) with 409. The router has
        // always returned it; declaring it keeps the client's status union
        // honest. Additive — no existing status changes.
        409: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Set recipe share mode',
    },

    /**
     * PUT /api/text-forms/:mention/share/is-public — toggle Agentura discovery
     * atop share_mode='authenticated'. Owner only. is_public=true requires
     * public_ownership and share_mode='authenticated' (enforced server-side).
     */
    setIsPublic: {
      method: 'PUT',
      path: '/api/text-forms/:mention/share/is-public',
      pathParams: z.object({ mention: z.string() }),
      body: textFormIsPublicBodySchema,
      responses: {
        200: textFormShareSettingsSchema,
        400: textFormErrorResponseSchema,
        401: textFormErrorResponseSchema,
        403: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        // `sharingFailure` refuses a non-custom row (a preset / LV override is
        // not the caller's own text form to share) with 409. The router has
        // always returned it; declaring it keeps the client's status union
        // honest. Additive — no existing status changes.
        409: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Toggle Agentura discovery for a recipe',
    },

    /**
     * PUT /api/text-forms/:mention/share — share the recipe with a group.
     * Members can use it immediately; the listing marks it as coming from
     * that group rather than blending it into their own.
     */
    share: {
      method: 'PUT',
      path: '/api/text-forms/:mention/share',
      pathParams: z.object({ mention: z.string() }),
      body: textFormShareBodySchema,
      responses: {
        200: textFormShareResponseSchema,
        401: textFormErrorResponseSchema,
        403: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Share a recipe with a group',
    },

    /** DELETE /api/text-forms/:mention/share — revoke a group share. */
    unshare: {
      method: 'DELETE',
      path: '/api/text-forms/:mention/share',
      pathParams: z.object({ mention: z.string() }),
      body: textFormShareBodySchema,
      responses: {
        200: textFormShareResponseSchema,
        401: textFormErrorResponseSchema,
        404: textFormErrorResponseSchema,
        500: textFormErrorResponseSchema,
      },
      summary: 'Revoke a recipe’s group share',
    },
  },
  { pathPrefix: '' }
);
