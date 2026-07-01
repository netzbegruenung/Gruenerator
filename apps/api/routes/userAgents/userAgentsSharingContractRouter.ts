/**
 * ts-rest contract router for user-agent (Agentura) sharing.
 *
 * Mounted alongside userAgentsContractRouter, BEFORE it, so the static
 * `/api/user-agents/public` route wins over `/api/user-agents/:identifier`.
 * Uses the polymorphic group_content_shares table (content_type='user_agents',
 * content_id = the agent's UUID) for group shares, and the user_agents row
 * (share_mode, is_public, public_ownership, locale) for the visibility settings.
 *
 * All routes require auth — requireAuth is applied at the /api/user-agents
 * prefix in routes.ts. Owner is `user_agents.user_id = req.user.id`.
 */

import { userAgentsSharingContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  getAgentSharing,
  listPublicUserAgents,
  updateAgentSharing,
} from '../../services/userAgents/userAgentsRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('userAgentsSharingContractRouter');

interface GroupShareJoinRow {
  group_id: string;
  group_name: string;
  shared_at: string | Date;
  [key: string]: unknown;
}

interface IdRow {
  id: string;
  [key: string]: unknown;
}

interface MembershipRow {
  user_id: string;
  [key: string]: unknown;
}

const s = initServer();

export const userAgentsSharingContractRouter = s.router(userAgentsSharingContract, {
  listPublic: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const agents = await listPublicUserAgents(user.locale ?? 'de-DE');
      return { status: 200 as const, body: { success: true, agents } };
    } catch (error) {
      log.error('[userAgentsSharingContract.listPublic] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  getShareSettings: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      return {
        status: 200 as const,
        body: {
          share_mode: sharing.share_mode,
          audience: sharing.audience,
          is_public: sharing.is_public,
          public_ownership: sharing.public_ownership,
        },
      };
    } catch (error) {
      log.error('[userAgentsSharingContract.getShareSettings] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setShareMode: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      // Invariant: Agentura discovery only makes sense atop
      // share_mode='authenticated'. Stepping down clears the discovery flag so
      // the listing query and the access check stay in lockstep.
      const patch: Parameters<typeof updateAgentSharing>[2] = { share_mode: args.body.mode };
      if (args.body.mode !== 'authenticated' && sharing.is_public) {
        patch.is_public = false;
        patch.public_ownership = null;
      }
      await updateAgentSharing(userId, args.params.identifier, patch);
      return {
        status: 200 as const,
        body: { success: true, message: 'Sichtbarkeit aktualisiert' },
      };
    } catch (error) {
      log.error('[userAgentsSharingContract.setShareMode] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setAudience: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      await updateAgentSharing(userId, args.params.identifier, { audience: args.body.audience });
      return { status: 200 as const, body: { success: true, message: 'Zielgruppe aktualisiert' } };
    } catch (error) {
      log.error('[userAgentsSharingContract.setAudience] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setIsPublic: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      const { is_public, public_ownership } = args.body;
      if (is_public) {
        if (!public_ownership) {
          return {
            status: 400 as const,
            body: { error: 'Bitte bestätige die Quelle der Inhalte (Eigentum oder öffentlich).' },
          };
        }
        if (sharing.share_mode !== 'authenticated') {
          return {
            status: 400 as const,
            body: {
              error:
                'Bitte zuerst Sichtbarkeit auf „Mit Anmeldung" setzen, dann in Agentura listen.',
            },
          };
        }
      }
      await updateAgentSharing(userId, args.params.identifier, {
        is_public,
        public_ownership: is_public ? public_ownership : null,
      });
      return {
        status: 200 as const,
        body: {
          success: true,
          message: is_public ? 'Agent*in in Agentura gelistet' : 'Listung entfernt',
        },
      };
    } catch (error) {
      log.error('[userAgentsSharingContract.setIsPublic] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  listGroupShares: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      const postgres = getPostgresInstance();
      const shares = (await postgres.query(
        `SELECT gcs.group_id, g.name AS group_name, gcs.shared_at
           FROM group_content_shares gcs
           INNER JOIN groups g ON g.id = gcs.group_id
           WHERE gcs.content_type = 'user_agents' AND gcs.content_id = $1
           ORDER BY gcs.shared_at DESC`,
        [sharing.id]
      )) as GroupShareJoinRow[];
      return {
        status: 200 as const,
        body: shares.map((row) => ({
          group_id: row.group_id,
          group_name: row.group_name,
          shared_at:
            row.shared_at instanceof Date ? row.shared_at.toISOString() : String(row.shared_at),
        })),
      };
    } catch (error) {
      log.error('[userAgentsSharingContract.listGroupShares] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  addGroupShare: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { group_id } = args.body;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
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
           WHERE content_type = 'user_agents' AND content_id = $1 AND group_id = $2`,
        [sharing.id, group_id]
      )) as IdRow[];
      if (existing.length > 0) {
        return {
          status: 409 as const,
          body: { error: 'Agent*in ist bereits mit dieser Gruppe geteilt' },
        };
      }

      const permissions = { read: true, write: false };
      await postgres.query(
        `INSERT INTO group_content_shares
            (content_type, content_id, group_id, shared_by_user_id, permissions)
          VALUES ('user_agents', $1, $2, $3, $4)`,
        [sharing.id, group_id, userId, JSON.stringify(permissions)]
      );

      return {
        status: 201 as const,
        body: { success: true, message: 'Agent*in mit Gruppe geteilt' },
      };
    } catch (error) {
      log.error('[userAgentsSharingContract.addGroupShare] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  deleteGroupShare: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const sharing = await getAgentSharing(userId, args.params.identifier);
      if (!sharing) {
        return { status: 404 as const, body: { error: 'Agent*in nicht gefunden' } };
      }
      const postgres = getPostgresInstance();
      const result = (await postgres.query(
        `DELETE FROM group_content_shares
           WHERE content_type = 'user_agents' AND content_id = $1 AND group_id = $2
           RETURNING id`,
        [sharing.id, args.params.groupId]
      )) as IdRow[];
      if (result.length === 0) {
        return { status: 404 as const, body: { error: 'Freigabe nicht gefunden' } };
      }
      return { status: 200 as const, body: { success: true, message: 'Freigabe entfernt' } };
    } catch (error) {
      log.error('[userAgentsSharingContract.deleteGroupShare] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },
});

export function mountUserAgentsSharingContractRouter(app: Application): void {
  createExpressEndpoints(userAgentsSharingContract, userAgentsSharingContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userAgentsSharingContract'),
  });
}
