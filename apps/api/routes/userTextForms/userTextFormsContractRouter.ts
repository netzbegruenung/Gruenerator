/**
 * ts-rest contract router for per-user learned writing styles ("Texte anlernen").
 *
 * Covers list / analyze / save / remove plus the group share endpoints
 * (PUT and DELETE /api/text-forms/:mention/share).
 *
 * requireAuth is applied at the /api/text-forms prefix in routes.ts.
 */

import {
  textFormMentionSchema,
  textFormTypeSchema,
  userTextFormsContract,
} from '@gruenerator/contracts';
import { SKILLS, landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { loadUserRoles } from '../../services/roles/userRoles.js';
import { analyzeTextForm, textTypeLabel } from '../../services/user/textFormAnalysisService.js';
import {
  deleteTextForm,
  shareTextFormWithGroup,
  unshareTextFormFromGroup,
  listTextForms,
  upsertTextForm,
} from '../../services/user/textFormRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkRecipeOverride } from './recipeOverrideAccess.js';

import type { Application } from 'express';

const log = createLogger('userTextFormsContractRouter');

const SKILL_MENTIONS = new Set<string>(SKILLS.map((s) => s.mention));
const PRESET_TYPES = new Set<string>(textFormTypeSchema.options);

const s = initServer();

export const userTextFormsContractRouter = s.router(userTextFormsContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const forms = await listTextForms(userId);
      return { status: 200 as const, body: { success: true, forms } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.list] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  analyze: async (args) => {
    try {
      getAuthedUser(args.req);
      const { textType, title, examples } = args.body;
      const label = textType ? textTypeLabel(textType) : (title?.trim() ?? '').slice(0, 80);
      if (!label) {
        return {
          status: 400 as const,
          body: { success: false, message: 'textType oder title ist erforderlich.' },
        };
      }
      const { styleBlock } = await analyzeTextForm(label, examples);
      return { status: 200 as const, body: { success: true, styleBlock } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.analyze] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  save: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const userId = user.id;
      const mention = args.params.mention;
      const body = args.body;

      if (body.kind === 'preset') {
        // Presets deliberately reuse the system-skill mention (that IS the
        // override mechanism): the path mention must equal the preset type.
        if (!body.textType || mention !== body.textType) {
          return {
            status: 400 as const,
            body: {
              success: false,
              message: 'Preset-Textformen müssen textType == mention haben.',
            },
          };
        }
      } else if (body.kind === 'recipe') {
        // Ein Stil FÜR EIN mitgeliefertes Landesverbands-Rezept — er ersetzt
        // dessen Rumpf, also entscheidet die Zuteilung (siehe dort).
        const verdict = checkRecipeOverride({
          mention,
          lvIds: landesverbandIdsForRoles(await loadUserRoles(userId), user.locale ?? 'de-DE'),
        });
        if (!verdict.ok) {
          return { status: verdict.status, body: { success: false, message: verdict.message } };
        }
      } else {
        // Custom forms must be a valid slug that does not shadow a system skill
        // or a preset type.
        const parsed = textFormMentionSchema.safeParse(mention);
        if (!parsed.success) {
          return {
            status: 400 as const,
            body: {
              success: false,
              message: parsed.error.issues[0]?.message ?? 'Ungültige Mention.',
            },
          };
        }
        if (SKILL_MENTIONS.has(mention) || PRESET_TYPES.has(mention)) {
          return {
            status: 409 as const,
            body: {
              success: false,
              message: `„@${mention}" ist bereits vergeben. Bitte einen anderen Namen wählen.`,
            },
          };
        }
      }

      const form = await upsertTextForm(userId, {
        kind: body.kind,
        textType: body.textType ?? null,
        mention,
        title: body.title,
        examples: body.examples,
        styleBlock: body.styleBlock,
      });
      return { status: 200 as const, body: { success: true, form } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.save] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const deleted = await deleteTextForm(userId, args.params.mention);
      if (!deleted) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Textform nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.remove] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  share: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const shares = await shareTextFormWithGroup(userId, args.params.mention, args.body.group_id);
      if (shares === null) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, sharedWithGroups: shares } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.share] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },

  unshare: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const shares = await unshareTextFormFromGroup(
        userId,
        args.params.mention,
        args.body.group_id
      );
      if (shares === null) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Rezept nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, sharedWithGroups: shares } };
    } catch (error) {
      const err = error as Error;
      log.error('[userTextFormsContract.unshare] Error:', err);
      return { status: 500 as const, body: { success: false, message: toUserFacingMessage(err) } };
    }
  },
});

/**
 * Mount the ts-rest user-text-forms contract router. Call from routes.ts.
 * requireAuth is applied at the /api/text-forms prefix.
 */
export function mountUserTextFormsContractRouter(app: Application): void {
  createExpressEndpoints(userTextFormsContract, userTextFormsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userTextFormsContract'),
  });
}
