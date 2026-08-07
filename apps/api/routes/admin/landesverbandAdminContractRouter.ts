/**
 * ts-rest contract router for the Landesverband-Admin self-service surface.
 * Every handler except `mine` calls `requireLandesverbandAdmin` as its
 * first line, with `landesverbandId` taken from `args.params` (never the
 * body) — and every query that follows reuses that exact value in its own
 * `WHERE landesverband_id = ...` clause. This is the structural guarantee
 * behind scope isolation between Landesverbände.
 */
import { landesverbandAdminContract } from '@gruenerator/contracts';
import { SKILLS } from '@gruenerator/shared/agents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getHiddenSkillMentions } from '../../services/skills/AdminHiddenSkillsService.js';
import {
  getHiddenSkillMentionsForLandesverband,
  hideSkillForLandesverband,
  unhideSkillForLandesverband,
} from '../../services/skills/LandesverbandHiddenSkillsService.js';
import { requireLandesverbandAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('landesverbandAdminContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung für diesen Landesverband.' },
};

interface MyScopeRow {
  id: string;
  name: string;
  country: 'DE' | 'AT';
}

interface LandesverbandDetailRow {
  id: string;
  name: string;
  country: 'DE' | 'AT';
  greeting_text: string | null;
  member_count: string;
}

interface LandesverbandUserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  created_at: string | null;
  email_verified: boolean;
}

const s = initServer();

export const landesverbandAdminContractRouter = s.router(landesverbandAdminContract, {
  mine: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const postgres = getPostgresInstance();

      if (authedUser.is_admin) {
        const rows = await postgres.query<MyScopeRow>(
          'SELECT id, name, country FROM landesverbaende ORDER BY country, name'
        );
        return { status: 200 as const, body: { success: true, data: rows } };
      }

      const rows = await postgres.query<MyScopeRow>(
        `SELECT l.id, l.name, l.country
         FROM landesverband_admins a
         JOIN landesverbaende l ON l.id = a.landesverband_id
         WHERE a.user_id = $1
         ORDER BY l.country, l.name`,
        [authedUser.id]
      );
      return { status: 200 as const, body: { success: true, data: rows } };
    } catch (error) {
      log.error('[landesverbandAdminContract.mine] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Landesverband-Zuständigkeiten.' },
      };
    }
  },

  get: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const { landesverbandId } = args.params;
      if (!(await requireLandesverbandAdmin(authedUser.id, landesverbandId, authedUser.email))) {
        return FORBIDDEN;
      }

      const postgres = getPostgresInstance();
      const row = await postgres.queryOne<LandesverbandDetailRow>(
        `SELECT l.id, l.name, l.country, l.greeting_text,
                COUNT(p.id) AS member_count
         FROM landesverbaende l
         LEFT JOIN profiles p ON p.landesverband_id = l.id
         WHERE l.id = $1
         GROUP BY l.id`,
        [landesverbandId]
      );
      if (!row) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Landesverband nicht gefunden.' },
        };
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          data: {
            id: row.id,
            name: row.name,
            country: row.country,
            greetingText: row.greeting_text,
            memberCount: Number(row.member_count),
          },
        },
      };
    } catch (error) {
      log.error('[landesverbandAdminContract.get] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden des Landesverbands.' },
      };
    }
  },

  updateGreeting: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const { landesverbandId } = args.params;
      if (!(await requireLandesverbandAdmin(authedUser.id, landesverbandId, authedUser.email))) {
        return FORBIDDEN;
      }

      const postgres = getPostgresInstance();
      await postgres.query(
        'UPDATE landesverbaende SET greeting_text = $1, updated_at = now() WHERE id = $2',
        [args.body.greetingText, landesverbandId]
      );

      log.info(
        `[landesverbandAdminContract] greeting updated for ${landesverbandId} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[landesverbandAdminContract.updateGreeting] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Speichern des Begrüßungstexts.' },
      };
    }
  },

  listSkills: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const { landesverbandId } = args.params;
      if (!(await requireLandesverbandAdmin(authedUser.id, landesverbandId, authedUser.email))) {
        return FORBIDDEN;
      }

      const [globallyHidden, lvHidden] = await Promise.all([
        getHiddenSkillMentions(),
        getHiddenSkillMentionsForLandesverband(landesverbandId),
      ]);
      const globallyHiddenSet = new Set(globallyHidden);
      const lvHiddenSet = new Set(lvHidden);

      const data = SKILLS.map((skill) => ({
        mention: skill.mention,
        title: skill.title,
        skillCategory: skill.skillCategory ?? null,
        hiddenGlobally: globallyHiddenSet.has(skill.mention),
        hiddenForLv: lvHiddenSet.has(skill.mention),
      }));

      return { status: 200 as const, body: { success: true, data } };
    } catch (error) {
      log.error('[landesverbandAdminContract.listSkills] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Rezepte.' },
      };
    }
  },

  setSkillHidden: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const { landesverbandId, mention } = args.params;
      if (!(await requireLandesverbandAdmin(authedUser.id, landesverbandId, authedUser.email))) {
        return FORBIDDEN;
      }

      if (args.body.hidden) {
        await hideSkillForLandesverband(landesverbandId, mention, authedUser.id);
      } else {
        await unhideSkillForLandesverband(landesverbandId, mention);
      }

      log.info(
        `[landesverbandAdminContract] ${mention} ${args.body.hidden ? 'hidden' : 'unhidden'} for ${landesverbandId} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[landesverbandAdminContract.setSkillHidden] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Ändern der Rezept-Sichtbarkeit.' },
      };
    }
  },

  listUsers: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      const { landesverbandId } = args.params;
      if (!(await requireLandesverbandAdmin(authedUser.id, landesverbandId, authedUser.email))) {
        return FORBIDDEN;
      }

      const postgres = getPostgresInstance();
      const rows = await postgres.query<LandesverbandUserRow>(
        `SELECT p.id, p.display_name, p.email, p.created_at,
                COALESCE(
                  split_part(p.email, '@', 2) = ANY(l.email_domains),
                  false
                ) AS email_verified
         FROM profiles p
         JOIN landesverbaende l ON l.id = p.landesverband_id
         WHERE p.landesverband_id = $1
         ORDER BY p.created_at DESC NULLS LAST`,
        [landesverbandId]
      );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map((row) => ({
            id: row.id,
            displayName: row.display_name,
            email: row.email,
            joinedAt: row.created_at,
            emailVerified: row.email_verified,
          })),
        },
      };
    } catch (error) {
      log.error('[landesverbandAdminContract.listUsers] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Mitgliederliste.' },
      };
    }
  },
});

export function mountLandesverbandAdminContractRouter(app: Application): void {
  createExpressEndpoints(landesverbandAdminContract, landesverbandAdminContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'landesverbandAdminContract'),
  });
}
