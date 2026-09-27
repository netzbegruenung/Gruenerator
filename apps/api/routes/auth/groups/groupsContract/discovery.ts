/**
 * Public-group discovery + admin-moderated join requests (the new feature added
 * alongside the migrated legacy routes). Each handler is bound to its contract
 * route via `s.route(...)` so the spread into `s.router(...)` in `index.ts`
 * stays fully type-inferred.
 */

import { groupsContract } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../../../database/services/PostgresService.js';
import { setGroupVisibility } from '../../../../services/groups/groupMutations.js';
import {
  createNotification,
  notifyGroupAdmins,
  notifyGroupMembers,
} from '../../../../services/notifications/index.js';
import { getPostgresAndCheckMembership } from '../groupCore.js';

import {
  s,
  log,
  getUserId,
  getUserLocale,
  groupErrorResponse,
  toIso,
  type DiscoverRow,
  type JoinRequestRow,
} from './shared.js';

import type { UserProfile } from '../../../../services/user/types.js';

export const discoveryRoutes = {
  discoverPublicGroups: s.route(groupsContract.discoverPublicGroups, async (args) => {
    try {
      const userId = getUserId(args.req);
      const locale = getUserLocale(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const rows = (await postgres.query(
        `SELECT g.id, g.name, g.description, g.avatar_url, g.audience,
                (SELECT COUNT(*) FROM group_memberships m
                   WHERE m.group_id = g.id AND m.is_active = TRUE)::int AS member_count,
                (SELECT r.status FROM group_join_requests r
                   WHERE r.group_id = g.id AND r.user_id = $1
                   ORDER BY r.requested_at DESC LIMIT 1) AS request_status
           FROM groups g
          WHERE g.is_public = TRUE
            AND g.is_active = TRUE
            AND COALESCE(g.group_type, 'standard') <> 'personal'
            AND g.audience IN ($2, 'all')
            AND NOT EXISTS (
              SELECT 1 FROM group_memberships m2
               WHERE m2.group_id = g.id AND m2.user_id = $1 AND m2.is_active = TRUE
            )
          ORDER BY g.name ASC`,
        [userId, locale],
        { table: 'groups' }
      )) as DiscoverRow[];

      return {
        status: 200 as const,
        body: rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          avatar_url: r.avatar_url,
          member_count: Number(r.member_count),
          audience: r.audience,
          request_status: r.request_status,
        })),
      };
    } catch (error) {
      log.error('[groupsContract.discoverPublicGroups] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Interner Fehler.' },
      };
    }
  }),

  setVisibility: s.route(groupsContract.setVisibility, async (args) => {
    const { groupId } = args.params;
    const { is_public, audience } = args.body;
    try {
      const userId = getUserId(args.req);
      const updated = await setGroupVisibility(groupId, userId, { is_public, audience });

      if (!updated) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }

      return {
        status: 200 as const,
        body: { success: true as const, is_public: updated.is_public, audience: updated.audience },
      };
    } catch (error) {
      return groupErrorResponse('setVisibility', 'Interner Fehler.', error);
    }
  }),

  requestToJoin: s.route(groupsContract.requestToJoin, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const group = (await postgres.queryOne(
        'SELECT id, name, is_public FROM groups WHERE id = $1 AND is_active = TRUE',
        [groupId],
        { table: 'groups' }
      )) as { id: string; name: string; is_public: boolean } | null;

      if (!group) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }
      if (!group.is_public) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Diese Gruppe ist nicht öffentlich.' },
        };
      }

      const existingMembership = await postgres.queryOne(
        'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND is_active = TRUE',
        [groupId, userId],
        { table: 'group_memberships' }
      );
      if (existingMembership) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Du bist bereits Mitglied dieser Gruppe.' },
        };
      }

      try {
        await postgres.exec('INSERT INTO group_join_requests (group_id, user_id) VALUES ($1, $2)', [
          groupId,
          userId,
        ]);
      } catch (insertErr) {
        if ((insertErr as { code?: string }).code === '23505') {
          return {
            status: 409 as const,
            body: {
              success: false as const,
              message: 'Du hast bereits eine offene Anfrage für diese Gruppe.',
            },
          };
        }
        throw insertErr;
      }

      const requesterName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';
      void notifyGroupAdmins({
        groupId,
        excludeUserId: userId,
        type: 'group_join_requested',
        title: 'Neue Beitrittsanfrage',
        body: `${requesterName} möchte „${group.name}" beitreten`,
        actionUrl: `/gruppen/${groupId}`,
      }).catch(() => {});

      return { status: 201 as const, body: { success: true as const, status: 'pending' as const } };
    } catch (error) {
      log.error('[groupsContract.requestToJoin] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Interner Fehler.' },
      };
    }
  }),

  listJoinRequests: s.route(groupsContract.listJoinRequests, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const rows = (await postgres.query(
        `SELECT r.id, r.group_id, r.user_id, r.status, r.requested_at,
                p.display_name, p.first_name, p.email, p.avatar_robot_id
           FROM group_join_requests r
           JOIN profiles p ON p.id = r.user_id
          WHERE r.group_id = $1 AND r.status = 'pending'
          ORDER BY r.requested_at ASC`,
        [groupId],
        { table: 'group_join_requests' }
      )) as JoinRequestRow[];

      return {
        status: 200 as const,
        body: rows.map((r) => ({
          id: r.id,
          group_id: r.group_id,
          user_id: r.user_id,
          status: r.status,
          requested_at: toIso(r.requested_at),
          display_name: r.display_name,
          first_name: r.first_name,
          email: r.email,
          avatar_robot_id: r.avatar_robot_id,
        })),
      };
    } catch (error) {
      return groupErrorResponse('listJoinRequests', 'Interner Fehler.', error);
    }
  }),

  approveJoinRequest: s.route(groupsContract.approveJoinRequest, async (args) => {
    const { groupId, requestId } = args.params;
    let reviewerId: string;
    try {
      reviewerId = getUserId(args.req);
      await getPostgresAndCheckMembership(groupId, reviewerId, true);
    } catch (error) {
      log.warn('[groupsContract.approveJoinRequest] Denied:', (error as Error).message);
      return {
        status: 403 as const,
        body: { success: false as const, message: 'Keine Berechtigung für diese Aktion.' },
      };
    }

    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const request = (await postgres.queryOne(
        `SELECT id, user_id FROM group_join_requests
           WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
        [requestId, groupId],
        { table: 'group_join_requests' }
      )) as { id: string; user_id: string } | null;

      if (!request) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Anfrage nicht gefunden.' },
        };
      }

      const group = (await postgres.queryOne('SELECT name FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { name: string } | null;

      await postgres.transaction(async (client) => {
        await postgres.transactionExec(
          client,
          `UPDATE group_join_requests
             SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [reviewerId, requestId]
        );
        await postgres.transactionExec(
          client,
          `INSERT INTO group_memberships (group_id, user_id, role)
             VALUES ($1, $2, 'member')
           ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = TRUE`,
          [groupId, request.user_id]
        );
      });

      const groupName = group?.name || 'Gruppe';
      void createNotification({
        userId: request.user_id,
        type: 'group_join_approved',
        title: 'Beitrittsanfrage angenommen',
        body: `Du bist jetzt Mitglied von „${groupName}"`,
        actionUrl: `/gruppen/${groupId}`,
        metadata: { groupId, groupName },
        groupKey: `group:${groupId}`,
      }).catch(() => {});
      void notifyGroupMembers({
        groupId,
        excludeUserId: request.user_id,
        type: 'group_member_joined',
        title: 'Neues Mitglied',
        body: `Ein neues Mitglied ist „${groupName}" beigetreten`,
        actionUrl: `/gruppen/${groupId}`,
      }).catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Anfrage angenommen.' },
      };
    } catch (error) {
      log.error('[groupsContract.approveJoinRequest] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Interner Fehler.' },
      };
    }
  }),

  denyJoinRequest: s.route(groupsContract.denyJoinRequest, async (args) => {
    const { groupId, requestId } = args.params;
    let reviewerId: string;
    try {
      reviewerId = getUserId(args.req);
      await getPostgresAndCheckMembership(groupId, reviewerId, true);
    } catch (error) {
      log.warn('[groupsContract.denyJoinRequest] Denied:', (error as Error).message);
      return {
        status: 403 as const,
        body: { success: false as const, message: 'Keine Berechtigung für diese Aktion.' },
      };
    }

    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const request = (await postgres.queryOne(
        `SELECT user_id FROM group_join_requests
           WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
        [requestId, groupId],
        { table: 'group_join_requests' }
      )) as { user_id: string } | null;

      if (!request) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Anfrage nicht gefunden.' },
        };
      }

      await postgres.exec(
        `UPDATE group_join_requests
           SET status = 'denied', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [reviewerId, requestId]
      );

      const group = (await postgres.queryOne('SELECT name FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { name: string } | null;
      const groupName = group?.name || 'Gruppe';

      void createNotification({
        userId: request.user_id,
        type: 'group_join_denied',
        title: 'Beitrittsanfrage abgelehnt',
        body: `Deine Anfrage für „${groupName}" wurde abgelehnt`,
        metadata: { groupId, groupName },
        groupKey: `group:${groupId}`,
      }).catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Anfrage abgelehnt.' },
      };
    } catch (error) {
      log.error('[groupsContract.denyJoinRequest] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Interner Fehler.' },
      };
    }
  }),
};
