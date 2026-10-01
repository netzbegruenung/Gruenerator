/**
 * ts-rest contract router for the Bundesgeschäftsstelle-instance admin
 * overview. Read-only except for the „Panda" unlock, `requireInstanceAdmin`-gated per-handler like
 * skillVisibilityContractRouter/adminTemplates — `requireAuth` at the mount
 * prefix in routes.ts covers authentication only.
 */
import {
  instanceAdminOverviewContract,
  type InstanceAdminUserSummary,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { isPandaEntitled } from '../../services/user/pandaEntitlement.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('instanceAdminOverviewContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

// Sane upper bound, not real pagination — a single deployment's user base is
// small enough that a flat list is the right shape for this admin view.
const USER_LIST_LIMIT = 1000;

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  last_login: string | null;
  created_at: string | null;
  panda_enabled: boolean | null;
}

const PROFILE_COLUMNS = 'id, email, display_name, is_admin, last_login, created_at, panda_enabled';

function toUserSummary(row: ProfileRow): InstanceAdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    pandaEnabled: row.panda_enabled,
    pandaEffective: isPandaEntitled(row.panda_enabled),
  };
}

interface ProfileRolesRow {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: Record<string, unknown>[] | null;
}

const s = initServer();

export const instanceAdminOverviewContractRouter = s.router(instanceAdminOverviewContract, {
  listUsers: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const postgres = getPostgresInstance();
      const rows = await postgres.query<ProfileRow>(
        `SELECT ${PROFILE_COLUMNS}
         FROM profiles ORDER BY created_at DESC NULLS LAST LIMIT $1`,
        [USER_LIST_LIMIT]
      );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map(toUserSummary),
        },
      };
    } catch (error) {
      log.error('[instanceAdminOverviewContract.listUsers] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Nutzerliste.' },
      };
    }
  },

  setUserPanda: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { userId } = args.params;
      const { enabled } = args.body;
      const postgres = getPostgresInstance();
      const rows = await postgres.query<ProfileRow>(
        `UPDATE profiles SET panda_enabled = $1 WHERE id = $2::uuid RETURNING ${PROFILE_COLUMNS}`,
        [enabled, userId]
      );
      const row = rows[0];
      if (!row) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Nutzer:in nicht gefunden.' },
        };
      }

      log.info(
        `[instanceAdminOverviewContract.setUserPanda] ${authedUser.id} set panda_enabled=${enabled} for ${userId}`
      );
      return { status: 200 as const, body: { success: true, data: toUserSummary(row) } };
    } catch (error) {
      log.error('[instanceAdminOverviewContract.setUserPanda] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Speichern der Freischaltung.' },
      };
    }
  },

  listRoles: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const postgres = getPostgresInstance();
      const rows = await postgres.query<ProfileRolesRow>(
        `SELECT id, email, display_name,
                (user_defaults #> '{profile,roles}') AS roles
         FROM profiles
         WHERE user_defaults #> '{profile,roles}' IS NOT NULL
         ORDER BY created_at DESC NULLS LAST LIMIT $1`,
        [USER_LIST_LIMIT]
      );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map((row) => ({
            userId: row.id,
            email: row.email,
            displayName: row.display_name,
            roles: row.roles,
          })),
        },
      };
    } catch (error) {
      log.error('[instanceAdminOverviewContract.listRoles] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Rollenübersicht.' },
      };
    }
  },
});

export function mountInstanceAdminOverviewContractRouter(app: Application): void {
  createExpressEndpoints(instanceAdminOverviewContract, instanceAdminOverviewContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'instanceAdminOverviewContract'),
  });
}
