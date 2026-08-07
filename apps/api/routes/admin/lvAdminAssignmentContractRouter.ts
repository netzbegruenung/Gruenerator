/**
 * ts-rest contract router for Hauptgrünerator-Super-Admin management of the
 * Landesverband tenant model: LV master data + who administers which LV.
 * Every handler is gated by `requireInstanceAdmin` only (never
 * `requireLandesverbandAdmin`) — granting/revoking LV-admin rights must
 * never depend on already being that LV's admin.
 */
import { lvAdminAssignmentContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('lvAdminAssignmentContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const USER_SEARCH_LIMIT = 25;

interface LandesverbandRow {
  id: string;
  name: string;
  country: 'DE' | 'AT';
  email_domains: string[];
  admin_count: string;
}

interface LandesverbandAdminRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  assigned_by: string | null;
  assigned_at: string;
}

interface AdminUserSearchRow {
  id: string;
  display_name: string | null;
  email: string | null;
  is_admin: boolean;
  created_at: string | null;
}

const s = initServer();

export const lvAdminAssignmentContractRouter = s.router(lvAdminAssignmentContract, {
  list: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const postgres = getPostgresInstance();
      const rows = await postgres.query<LandesverbandRow>(
        `SELECT l.id, l.name, l.country, l.email_domains,
                COUNT(a.id) AS admin_count
         FROM landesverbaende l
         LEFT JOIN landesverband_admins a ON a.landesverband_id = l.id
         GROUP BY l.id
         ORDER BY l.country, l.name`
      );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map((row) => ({
            id: row.id,
            name: row.name,
            country: row.country,
            emailDomains: row.email_domains ?? [],
            adminCount: Number(row.admin_count),
          })),
        },
      };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.list] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Landesverbände.' },
      };
    }
  },

  update: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { landesverbandId } = args.params;
      const { name, emailDomains } = args.body;
      const postgres = getPostgresInstance();

      const existing = await postgres.queryOne('SELECT id FROM landesverbaende WHERE id = $1', [
        landesverbandId,
      ]);
      if (!existing) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Landesverband nicht gefunden.' },
        };
      }

      if (emailDomains) {
        const normalized = emailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
        const conflict = await postgres.query<{ id: string }>(
          `SELECT id FROM landesverbaende WHERE id != $1 AND email_domains && $2::text[]`,
          [landesverbandId, normalized]
        );
        if (conflict.length > 0) {
          return {
            status: 409 as const,
            body: {
              success: false,
              message: `Domain bereits einem anderen Landesverband zugeordnet (${conflict[0]!.id}).`,
            },
          };
        }
      }

      await postgres.query(
        `UPDATE landesverbaende SET
           name = COALESCE($1, name),
           email_domains = COALESCE($2::text[], email_domains),
           updated_at = now()
         WHERE id = $3`,
        [
          name ?? null,
          emailDomains ? emailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean) : null,
          landesverbandId,
        ]
      );

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.update] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Aktualisieren des Landesverbands.' },
      };
    }
  },

  listAdmins: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { landesverbandId } = args.params;
      const postgres = getPostgresInstance();
      const rows = await postgres.query<LandesverbandAdminRow>(
        `SELECT a.user_id, p.email, p.display_name, a.assigned_by, a.assigned_at
         FROM landesverband_admins a
         JOIN profiles p ON p.id = a.user_id
         WHERE a.landesverband_id = $1
         ORDER BY a.assigned_at DESC`,
        [landesverbandId]
      );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map((row) => ({
            userId: row.user_id,
            email: row.email,
            displayName: row.display_name,
            assignedBy: row.assigned_by,
            assignedAt: row.assigned_at,
          })),
        },
      };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.listAdmins] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Landesverband-Admins.' },
      };
    }
  },

  assignAdmin: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { landesverbandId } = args.params;
      const postgres = getPostgresInstance();

      const landesverband = await postgres.queryOne(
        'SELECT id FROM landesverbaende WHERE id = $1',
        [landesverbandId]
      );
      if (!landesverband) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Landesverband nicht gefunden.' },
        };
      }

      const targetUser = await postgres.queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE email = $1',
        [args.body.email.trim().toLowerCase()]
      );
      if (!targetUser) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Keine Person mit dieser E-Mail-Adresse gefunden.' },
        };
      }

      await postgres.query(
        `INSERT INTO landesverband_admins (landesverband_id, user_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (landesverband_id, user_id) DO NOTHING`,
        [landesverbandId, targetUser.id, authedUser.id]
      );

      log.info(
        `[lvAdminAssignmentContract] ${targetUser.id} assigned as admin of ${landesverbandId} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.assignAdmin] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Zuweisen der Landesverband-Admin-Rechte.' },
      };
    }
  },

  revokeAdmin: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { landesverbandId, userId } = args.params;
      const postgres = getPostgresInstance();
      await postgres.query(
        'DELETE FROM landesverband_admins WHERE landesverband_id = $1 AND user_id = $2',
        [landesverbandId, userId]
      );

      log.info(
        `[lvAdminAssignmentContract] ${userId} revoked as admin of ${landesverbandId} by ${authedUser.id}`
      );
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.revokeAdmin] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Entfernen der Landesverband-Admin-Rechte.' },
      };
    }
  },

  searchUsers: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const search = args.query.search?.trim();
      const postgres = getPostgresInstance();
      const rows = search
        ? await postgres.query<AdminUserSearchRow>(
            `SELECT id, display_name, email, is_admin, created_at FROM profiles
             WHERE email ILIKE $1 OR display_name ILIKE $1
             ORDER BY created_at DESC NULLS LAST LIMIT $2`,
            [`%${search}%`, USER_SEARCH_LIMIT]
          )
        : await postgres.query<AdminUserSearchRow>(
            `SELECT id, display_name, email, is_admin, created_at FROM profiles
             ORDER BY created_at DESC NULLS LAST LIMIT $1`,
            [USER_SEARCH_LIMIT]
          );

      return {
        status: 200 as const,
        body: {
          success: true,
          data: rows.map((row) => ({
            id: row.id,
            displayName: row.display_name,
            email: row.email,
            isAdmin: row.is_admin,
            joinedAt: row.created_at,
          })),
          nextCursor: null,
        },
      };
    } catch (error) {
      log.error('[lvAdminAssignmentContract.searchUsers] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler bei der Nutzersuche.' },
      };
    }
  },
});

export function mountLvAdminAssignmentContractRouter(app: Application): void {
  createExpressEndpoints(lvAdminAssignmentContract, lvAdminAssignmentContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'lvAdminAssignmentContract'),
  });
}
