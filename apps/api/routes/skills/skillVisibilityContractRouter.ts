/**
 * ts-rest contract router for Rezepte (skill) visibility.
 *
 * `getVisibility` requires only authentication (applied at the `/api/skills`
 * prefix in routes.ts, same as skillPromptContractRouter). `list`/`setHidden`
 * additionally require an is_admin check, enforced per-handler like
 * adminVorlagenContractRouter — requireAuth at the `/api/auth/admin/skills`
 * prefix covers authentication only.
 */
import { skillVisibilityContract } from '@gruenerator/contracts';
import { SKILLS, isSkillOfferedIn } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { getUserLandesverbandId } from '../../services/landesverband/LandesverbandDerivationService.js';
import {
  getHiddenSkillMentions,
  getEffectiveHiddenSkillMentions,
  hideSkill,
  unhideSkill,
} from '../../services/skills/AdminHiddenSkillsService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('skillVisibilityContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const s = initServer();

export const skillVisibilityContractRouter = s.router(skillVisibilityContract, {
  getVisibility: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const landesverbandId = await getUserLandesverbandId(authedUser.id);
      const hiddenMentions = [...(await getEffectiveHiddenSkillMentions(landesverbandId))];
      return { status: 200 as const, body: { hiddenMentions } };
    } catch (error) {
      log.error('[skillVisibilityContract.getVisibility] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Rezepte-Sichtbarkeit.' },
      };
    }
  },

  list: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const hiddenMentions = new Set(await getHiddenSkillMentions());
      // Nur was die Instanz überhaupt führt. Ohne diesen Filter listet der
      // Admin einer Instanz, die die Landesverbände ausblendet, deren ~25
      // Rezepte samt Schalter — und der Schalter tut nichts Sichtbares, weil
      // jede Entdeckungsfläche sie ohnehin über `isSkillOfferedIn` fallen
      // lässt. Serverseitig und nicht in der Oberfläche, weil dieselbe
      // Antwort jeden Client bedient.
      const data = SKILLS.filter((skill) => isSkillOfferedIn(skill, CURRENT_INSTANCE)).map(
        (skill) => ({
          mention: skill.mention,
          identifier: skill.identifier,
          title: skill.title,
          skillCategory: skill.skillCategory ?? null,
          hidden: hiddenMentions.has(skill.mention),
        })
      );

      return { status: 200 as const, body: { success: true, data } };
    } catch (error) {
      log.error('[skillVisibilityContract.list] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Rezepte.' },
      };
    }
  },

  setHidden: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { mention } = args.params;
      if (args.body.hidden) {
        await hideSkill(mention, authedUser.id);
      } else {
        await unhideSkill(mention);
      }

      log.info(
        `[skillVisibilityContract] ${mention} ${args.body.hidden ? 'hidden' : 'unhidden'} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[skillVisibilityContract.setHidden] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Ändern der Rezept-Sichtbarkeit.' },
      };
    }
  },
});

export function mountSkillVisibilityContractRouter(app: Application): void {
  createExpressEndpoints(skillVisibilityContract, skillVisibilityContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'skillVisibilityContract'),
  });
}
