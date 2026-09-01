/**
 * ts-rest contract router for notebook sharing endpoints.
 *
 * Mounted alongside notebookCollectionsContractRouter. Uses the polymorphic
 * group_content_shares table (content_type='notebook_collections') for group
 * shares and the Qdrant notebook payload (share_mode, edit_policy) for the
 * read/edit decision matrix.
 *
 * All routes require auth — `requireAuth` is applied at the path prefix in
 * routes.ts. `getUserId` throws when req.user is missing as a safety guard.
 */

import { notebookSharingContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { applyNotebookVisibility } from '../../services/notebook/notebookVisibility.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { checkNotebookAccess } from './notebookAccess.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('notebookSharingContractRouter');
const notebookHelper = new NotebookQdrantHelper();

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    throw new Error('Authentication required');
  }
  return user.id;
}

interface UserGroupRow {
  id: string;
  name: string;
  role: string;
  [key: string]: unknown;
}

interface GroupShareJoinRow {
  group_id: string;
  group_name: string;
  shared_at: string | Date;
  [key: string]: unknown;
}

interface MembershipRow {
  user_id: string;
  [key: string]: unknown;
}

interface ExistingShareRow {
  id: string;
  [key: string]: unknown;
}

const s = initServer();

/**
 * Die Regeln (Owner-Gate, Abstufung löscht die Listung, Listung braucht
 * 'authenticated' + public_ownership) leben in `notebookVisibility.ts`, weil
 * die Chat-Karte dieselben braucht. Hier bleibt nur die Übersetzung in die
 * Statuscodes des Contracts.
 */
function visibilityFailure<S extends 400 | 403 | 404>(failed: {
  status: S;
  error: string;
}): { status: S; body: { error: string } } {
  return { status: failed.status, body: { error: failed.error } };
}

export const notebookSharingContractRouter = s.router(notebookSharingContract, {
  listMyGroups: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      const groups = (await postgres.query(
        `SELECT g.id, g.name, gm.role
           FROM groups g
           INNER JOIN group_memberships gm ON gm.group_id = g.id
           WHERE gm.user_id = $1
           ORDER BY g.name ASC`,
        [userId]
      )) as UserGroupRow[];
      return {
        status: 200 as const,
        body: groups.map((g) => ({ id: g.id, name: g.name, role: g.role })),
      };
    } catch (error) {
      log.error('[notebookSharingContract.listMyGroups] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch user groups' } };
    }
  },

  getShareSettings: async (args) => {
    try {
      const userId = getUserId(args.req);
      const access = await checkNotebookAccess(args.params.id, userId);
      if (!access.exists) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (!access.canRead) {
        return { status: 403 as const, body: { error: 'Keine Berechtigung' } };
      }
      const collection = await notebookHelper.getNotebookCollection(args.params.id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      return {
        status: 200 as const,
        body: {
          share_mode: collection.share_mode,
          edit_policy: collection.edit_policy,
          audience: collection.audience,
          is_public: collection.is_public === true,
          public_ownership: collection.public_ownership ?? null,
        },
      };
    } catch (error) {
      log.error('[notebookSharingContract.getShareSettings] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setShareMode: async (args) => {
    try {
      const userId = getUserId(args.req);
      const applied = await applyNotebookVisibility(args.params.id, userId, {
        share_mode: args.body.mode,
      });
      if (!applied.ok) {
        // Ein 400 entsteht nur aus `is_public`; dieser Contract kennt ihn nicht.
        if (applied.status === 400) throw new Error(applied.error);
        return visibilityFailure(applied);
      }
      return {
        status: 200 as const,
        body: { success: true, message: 'Sichtbarkeit aktualisiert' },
      };
    } catch (error) {
      log.error('[notebookSharingContract.setShareMode] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setIsPublic: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { is_public, public_ownership } = args.body;
      const applied = await applyNotebookVisibility(args.params.id, userId, {
        is_public,
        public_ownership: public_ownership ?? null,
      });
      if (!applied.ok) return visibilityFailure(applied);
      return {
        status: 200 as const,
        body: {
          success: true,
          message: is_public ? 'Notebook auf Von der Basis gelistet' : 'Listung entfernt',
        },
      };
    } catch (error) {
      log.error('[notebookSharingContract.setIsPublic] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setEditPolicy: async (args) => {
    try {
      const userId = getUserId(args.req);
      const applied = await applyNotebookVisibility(args.params.id, userId, {
        edit_policy: args.body.policy,
      });
      if (!applied.ok) {
        // Ein 400 entsteht nur aus `is_public`; dieser Contract kennt ihn nicht.
        if (applied.status === 400) throw new Error(applied.error);
        return visibilityFailure(applied);
      }
      return {
        status: 200 as const,
        body: { success: true, message: 'Bearbeitungsrechte aktualisiert' },
      };
    } catch (error) {
      log.error('[notebookSharingContract.setEditPolicy] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setAudience: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collection = await notebookHelper.getNotebookCollection(args.params.id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (collection.user_id !== userId) {
        return { status: 403 as const, body: { error: 'Nur Eigentümer*in erlaubt' } };
      }
      await notebookHelper.updateNotebookCollection(args.params.id, {
        audience: args.body.audience,
      });
      return {
        status: 200 as const,
        body: { success: true, message: 'Zielgruppe aktualisiert' },
      };
    } catch (error) {
      log.error('[notebookSharingContract.setAudience] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  listGroupShares: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collection = await notebookHelper.getNotebookCollection(args.params.id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (collection.user_id !== userId) {
        return { status: 403 as const, body: { error: 'Nur Eigentümer*in kann Freigaben sehen' } };
      }
      const postgres = getPostgresInstance();
      const shares = (await postgres.query(
        `SELECT gcs.group_id, g.name AS group_name, gcs.shared_at
           FROM group_content_shares gcs
           INNER JOIN groups g ON g.id = gcs.group_id
           WHERE gcs.content_type = 'notebook_collections' AND gcs.content_id = $1
           ORDER BY gcs.shared_at DESC`,
        [args.params.id]
      )) as GroupShareJoinRow[];
      return {
        status: 200 as const,
        body: shares.map((s_) => ({
          group_id: s_.group_id,
          group_name: s_.group_name,
          shared_at:
            s_.shared_at instanceof Date ? s_.shared_at.toISOString() : String(s_.shared_at),
        })),
      };
    } catch (error) {
      log.error('[notebookSharingContract.listGroupShares] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  addGroupShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { group_id } = args.body;
      const notebookId = args.params.id;

      const collection = await notebookHelper.getNotebookCollection(notebookId);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (collection.user_id !== userId) {
        return {
          status: 403 as const,
          body: { error: 'Nur Eigentümer*in kann Gruppen hinzufügen' },
        };
      }

      // checkNotebookAccess gates group reads on share_mode='groups'. The share
      // modal sets it before reaching here, but enforce it server-side too so
      // the invariant holds regardless of the caller (mirrors the generic
      // groups.shareContent path). 'authenticated' is left alone — members
      // already have read access and demoting would narrow visibility.
      if (collection.share_mode !== 'groups' && collection.share_mode !== 'authenticated') {
        await notebookHelper.updateNotebookCollection(notebookId, { share_mode: 'groups' });
      }

      const postgres = getPostgresInstance();
      const membership = (await postgres.query(
        'SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group_id, userId]
      )) as MembershipRow[];
      if (membership.length === 0) {
        return {
          status: 403 as const,
          body: { error: 'Du musst Mitglied der Gruppe sein, um zu teilen' },
        };
      }

      const existing = (await postgres.query(
        `SELECT id FROM group_content_shares
           WHERE content_type = 'notebook_collections' AND content_id = $1 AND group_id = $2`,
        [notebookId, group_id]
      )) as ExistingShareRow[];
      if (existing.length > 0) {
        return {
          status: 409 as const,
          body: { error: 'Notebook ist bereits mit dieser Gruppe geteilt' },
        };
      }

      const permissions = { read: true, write: false };
      await postgres.query(
        `INSERT INTO group_content_shares
            (content_type, content_id, group_id, shared_by_user_id, permissions)
          VALUES ('notebook_collections', $1, $2, $3, $4)`,
        [notebookId, group_id, userId, JSON.stringify(permissions)]
      );

      return {
        status: 201 as const,
        body: { success: true, message: 'Notebook mit Gruppe geteilt' },
      };
    } catch (error) {
      log.error('[notebookSharingContract.addGroupShare] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  deleteGroupShare: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collection = await notebookHelper.getNotebookCollection(args.params.id);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (collection.user_id !== userId) {
        return {
          status: 403 as const,
          body: { error: 'Nur Eigentümer*in kann Freigaben entfernen' },
        };
      }
      const postgres = getPostgresInstance();
      const result = (await postgres.query(
        `DELETE FROM group_content_shares
           WHERE content_type = 'notebook_collections' AND content_id = $1 AND group_id = $2
           RETURNING id`,
        [args.params.id, args.params.groupId]
      )) as ExistingShareRow[];
      if (result.length === 0) {
        return { status: 404 as const, body: { error: 'Freigabe nicht gefunden' } };
      }
      return { status: 200 as const, body: { success: true, message: 'Freigabe entfernt' } };
    } catch (error) {
      log.error('[notebookSharingContract.deleteGroupShare] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },
});

export function mountNotebookSharingContractRouter(app: Application): void {
  createExpressEndpoints(notebookSharingContract, notebookSharingContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notebookSharingContract'),
  });
}
