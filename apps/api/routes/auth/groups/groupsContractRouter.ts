/**
 * ts-rest contract router for public-group discovery + admin-moderated join
 * requests. Mounted alongside the legacy raw group routes; `requireAuth` is
 * applied at the `/api/auth/groups` prefix in routes.ts.
 */

import crypto from 'crypto';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { groupsContract } from '@gruenerator/contracts';
import { extractSlugSuffix, generateSlugSuffix } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { v4 as uuidv4 } from 'uuid';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  createNotification,
  notifyGroupAdmins,
  notifyGroupMembers,
} from '../../../services/notifications/index.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type { GroupLinkBody } from '@gruenerator/contracts';
import type { UserProfile } from '../../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('groupsContractRouter');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../../uploads/group-avatars');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredGroupLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon: string;
}

/** Map a membership/permission throw to 403, anything else to 500. */
function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Mitglied') || msg.includes('Berechtigung') || msg.includes('Admin');
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    throw new Error('Authentication required');
  }
  return user.id;
}

function getUserLocale(req: Request): 'de-DE' | 'de-AT' {
  const user = req.user as UserProfile | undefined;
  return user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

interface DiscoverRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number | string;
  audience: 'de-DE' | 'de-AT' | 'all';
  request_status: 'pending' | 'approved' | 'denied' | null;
}

interface JoinRequestRow {
  id: string;
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string | Date;
  display_name: string | null;
  first_name: string | null;
  email: string | null;
  avatar_robot_id: number | null;
}

const s = initServer();

export const groupsContractRouter = s.router(groupsContract, {
  discoverPublicGroups: async (args) => {
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
  },

  setVisibility: async (args) => {
    const { groupId } = args.params;
    const { is_public, audience } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const updated = (await postgres.queryOne(
        `UPDATE groups SET is_public = $1, audience = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
         RETURNING is_public, audience`,
        [is_public, audience, groupId],
        { table: 'groups' }
      )) as { is_public: boolean; audience: 'de-DE' | 'de-AT' | 'all' } | null;

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
      log.warn('[groupsContract.setVisibility] Denied/failed:', (error as Error).message);
      return {
        status: 403 as const,
        body: { success: false as const, message: 'Keine Berechtigung für diese Aktion.' },
      };
    }
  },

  requestToJoin: async (args) => {
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
  },

  listJoinRequests: async (args) => {
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
      log.warn('[groupsContract.listJoinRequests] Denied/failed:', (error as Error).message);
      return {
        status: 403 as const,
        body: { success: false as const, message: 'Keine Berechtigung für diese Aktion.' },
      };
    }
  },

  approveJoinRequest: async (args) => {
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
  },

  denyJoinRequest: async (args) => {
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
  },

  // ── Core group CRUD / membership / links (migrated from legacy raw routes) ──

  listUserGroups: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const memberships = (await postgres.query(
        'SELECT group_id, role, joined_at FROM group_memberships WHERE user_id = $1',
        [userId],
        { table: 'group_memberships' }
      )) as Array<{ group_id: string; role: string; joined_at: string | Date }>;

      if (!memberships || memberships.length === 0) {
        return { status: 200 as const, body: { success: true as const, groups: [] } };
      }

      const groupIds = memberships.map((m) => m.group_id);
      const groupsData = (await postgres.query(
        'SELECT id, name, description, created_at, created_by, join_token, settings, avatar_url, links, slug_suffix FROM groups WHERE id = ANY($1)',
        [groupIds],
        { table: 'groups' }
      )) as Array<{
        id: string;
        name: string;
        description: string | null;
        created_at: string | Date | null;
        created_by: string | null;
        join_token: string | null;
        settings: Record<string, unknown> | null;
        avatar_url: string | null;
        links: StoredGroupLink[] | null;
        slug_suffix: string | null;
      }>;

      const byId = new Map(memberships.map((m) => [m.group_id, m]));
      const groups = (groupsData || []).map((group) => {
        const m = byId.get(group.id);
        const role = m?.role || 'member';
        return {
          id: group.id,
          name: group.name,
          description: group.description ?? null,
          created_at: toIsoOrNull(group.created_at),
          created_by: group.created_by ?? null,
          join_token: group.join_token ?? null,
          settings: group.settings ?? null,
          avatar_url: group.avatar_url ?? null,
          links: group.links ?? null,
          role,
          joined_at: toIsoOrNull(m?.joined_at),
          isAdmin: group.created_by === userId || role === 'admin',
          slug_suffix: group.slug_suffix ?? null,
        };
      });

      return { status: 200 as const, body: { success: true as const, groups } };
    } catch (error) {
      log.error('[groupsContract.listUserGroups] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Gruppen.' },
      };
    }
  },

  resolveGroup: async (args) => {
    try {
      const input = args.params.slugOrId;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const suffix = extractSlugSuffix(input);
      // Without a suffix the input can only be a raw UUID; reject anything else
      // before the query, where a non-UUID would crash the id cast.
      if (!suffix && !UUID_RE.test(input)) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }

      const row = (await postgres.queryOne(
        suffix
          ? 'SELECT id FROM groups WHERE slug_suffix = $1'
          : 'SELECT id FROM groups WHERE id = $1',
        [suffix ?? input],
        { table: 'groups' }
      )) as { id: string } | null;

      if (!row) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }

      return { status: 200 as const, body: { success: true as const, id: row.id } };
    } catch (error) {
      log.error('[groupsContract.resolveGroup] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Auflösen der Gruppe.' },
      };
    }
  },

  createGroup: async (args) => {
    try {
      const userId = getUserId(args.req);
      const name = args.body.name.trim();
      const joinToken = crypto.randomBytes(16).toString('hex');
      const groupId = uuidv4();
      const slugSuffix = generateSlugSuffix();
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const newGroup = await postgres.transaction(async (client) => {
        const group = (await postgres.transactionQueryOne(
          client,
          `INSERT INTO groups (id, name, created_by, join_token, description, slug_suffix)
             VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, description, created_at, created_by, join_token, slug_suffix`,
          [groupId, name, userId, joinToken, null, slugSuffix]
        )) as {
          id: string;
          name: string;
          description: string | null;
          created_at: string | Date | null;
          created_by: string | null;
          join_token: string | null;
          slug_suffix: string | null;
        } | null;

        if (!group) throw new Error('Failed to create group');

        await postgres.transactionExec(
          client,
          'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
          [group.id, userId, 'admin']
        );

        return group;
      });

      return {
        status: 200 as const,
        body: {
          success: true as const,
          group: {
            id: newGroup.id,
            name: newGroup.name,
            description: newGroup.description ?? null,
            created_at: toIsoOrNull(newGroup.created_at),
            created_by: newGroup.created_by ?? null,
            join_token: newGroup.join_token ?? null,
            role: 'admin',
            isAdmin: true,
            joined_at: new Date().toISOString(),
            slug_suffix: newGroup.slug_suffix ?? null,
          },
        },
      };
    } catch (error) {
      log.error('[groupsContract.createGroup] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Erstellen der Gruppe.' },
      };
    }
  },

  deleteGroup: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const groupData = (await postgres.queryOne(
        'SELECT name, created_by, avatar_url FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { name: string; created_by: string; avatar_url?: string | null } | null;

      if (!groupData) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }

      if (groupData.created_by !== userId) {
        const membership = (await postgres.queryOne(
          'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
          [groupId, userId],
          { table: 'group_memberships' }
        )) as { role: string } | null;
        if (!membership || membership.role !== 'admin') {
          return {
            status: 403 as const,
            body: {
              success: false as const,
              message: 'Keine Berechtigung zum Löschen dieser Gruppe.',
            },
          };
        }
      }

      await notifyGroupMembers({
        groupId,
        excludeUserId: userId,
        type: 'group_deleted',
        title: 'Gruppe aufgelöst',
        body: `„${groupData.name}" wurde aufgelöst`,
        actionUrl: '/gruppen',
      });

      await postgres.transaction(async (client) => {
        await postgres.transactionExec(
          client,
          'DELETE FROM group_instructions WHERE group_id = $1',
          [groupId]
        );
        await postgres.transactionExec(
          client,
          'DELETE FROM group_content_shares WHERE group_id = $1',
          [groupId]
        );
        await postgres.transactionExec(
          client,
          'DELETE FROM group_memberships WHERE group_id = $1',
          [groupId]
        );
        const result = await postgres.transactionExec(client, 'DELETE FROM groups WHERE id = $1', [
          groupId,
        ]);
        if (result.changes === 0) throw new Error('Group not found or already deleted');
      });

      if (groupData.avatar_url) {
        const avatarPath = path.join(AVATAR_UPLOAD_DIR, path.basename(groupData.avatar_url));
        fs.promises.unlink(avatarPath).catch(() => {});
      }

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Gruppe erfolgreich gelöscht.' },
      };
    } catch (error) {
      log.error('[groupsContract.deleteGroup] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Löschen der Gruppe.' },
      };
    }
  },

  getDetails: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const row = (await postgres.queryOne(
        `SELECT gm.role, gm.joined_at,
                g.id, g.name, g.description, g.created_at, g.created_by, g.join_token,
                g.settings, g.avatar_url, g.links, g.is_public, g.audience, g.slug_suffix
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
          WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      )) as {
        role: string;
        joined_at: string | Date | null;
        id: string;
        name: string;
        description: string | null;
        created_at: string | Date | null;
        created_by: string | null;
        join_token: string | null;
        settings: Record<string, unknown> | null;
        avatar_url: string | null;
        links: StoredGroupLink[] | null;
        is_public: boolean | null;
        audience: 'de-DE' | 'de-AT' | 'all' | null;
        slug_suffix: string | null;
      } | null;

      if (!row) {
        return {
          status: 403 as const,
          body: { success: false as const, message: 'Du bist nicht Mitglied dieser Gruppe.' },
        };
      }

      const isAdmin = row.role === 'admin' || row.created_by === userId;

      return {
        status: 200 as const,
        body: {
          success: true as const,
          group: {
            id: row.id,
            name: row.name,
            description: row.description ?? null,
            created_at: toIsoOrNull(row.created_at),
            created_by: row.created_by ?? null,
            join_token: row.join_token ?? null,
            settings: row.settings ?? null,
            avatar_url: row.avatar_url ?? null,
            links: row.links ?? [],
            is_public: row.is_public ?? false,
            audience: row.audience ?? 'all',
            slug_suffix: row.slug_suffix ?? null,
          },
          membership: {
            role: row.role,
            joined_at: toIsoOrNull(row.joined_at),
            isAdmin,
          },
        },
      };
    } catch (error) {
      log.error('[groupsContract.getDetails] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Gruppendetails.' },
      };
    }
  },

  updateInfo: async (args) => {
    const { groupId } = args.params;
    const { name, description, settings } = args.body;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const membershipAndGroup = (await postgres.queryOne(
        `SELECT gm.role, g.created_by
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
          WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      )) as { role: string; created_by: string } | null;

      if (!membershipAndGroup) {
        return {
          status: 403 as const,
          body: { success: false as const, message: 'Du bist nicht Mitglied dieser Gruppe.' },
        };
      }
      if (membershipAndGroup.role !== 'admin' && membershipAndGroup.created_by !== userId) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Keine Berechtigung zum Ändern der Gruppendetails.',
          },
        };
      }

      const updateFields: string[] = [];
      const updateValues: Array<string | null> = [];
      let paramIndex = 1;

      if (name != null) {
        if (!name.trim()) {
          return {
            status: 400 as const,
            body: { success: false as const, message: 'Gruppenname darf nicht leer sein.' },
          };
        }
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name.trim());
      }
      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(description?.trim() || null);
      }
      if (settings != null) {
        updateFields.push(`settings = $${paramIndex++}`);
        updateValues.push(JSON.stringify(settings));
      }

      if (updateFields.length === 0) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Keine Änderungen angegeben.' },
        };
      }

      updateValues.push(groupId);
      const result = await postgres.exec(
        `UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
      if (result.changes === 0) throw new Error('Group not found or no changes made');

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Gruppendetails erfolgreich aktualisiert.' },
      };
    } catch (error) {
      log.error('[groupsContract.updateInfo] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren der Gruppendetails.' },
      };
    }
  },

  updateName: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const name = args.body.name;
      if (!name?.trim()) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Gruppenname ist erforderlich.' },
        };
      }
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
      const result = await postgres.exec('UPDATE groups SET name = $1 WHERE id = $2', [
        name.trim(),
        groupId,
      ]);
      if (result.changes === 0) throw new Error('Group not found or no changes made');
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Gruppenname erfolgreich aktualisiert.' },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.updateName] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren des Gruppennamens.' },
      };
    }
  },

  verifyToken: async (args) => {
    const { joinToken } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      if (!joinToken?.trim()) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Beitritts-Token ist erforderlich.' },
        };
      }

      const group = (await postgres.queryOne(
        'SELECT id, name FROM groups WHERE join_token = $1',
        [joinToken.trim()],
        { table: 'groups' }
      )) as { id: string; name: string } | null;

      if (!group) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            message: 'Ungültiger oder abgelaufener Einladungslink.',
          },
        };
      }

      const existingMembership = await postgres.queryOne(
        'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group.id, userId],
        { table: 'group_memberships' }
      );

      return {
        status: 200 as const,
        body: { success: true as const, group, alreadyMember: !!existingMembership },
      };
    } catch (error) {
      log.error('[groupsContract.verifyToken] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Überprüfen des Einladungslinks.' },
      };
    }
  },

  joinByToken: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { joinToken } = args.body;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const group = (await postgres.queryOne(
        'SELECT id, name FROM groups WHERE join_token = $1',
        [joinToken.trim()],
        { table: 'groups' }
      )) as { id: string; name: string } | null;

      if (!group) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            message: 'Ungültiger oder abgelaufener Einladungslink.',
          },
        };
      }

      const existingMembership = await postgres.queryOne(
        'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group.id, userId],
        { table: 'group_memberships' }
      );

      if (existingMembership) {
        return {
          status: 200 as const,
          body: {
            success: true as const,
            group,
            alreadyMember: true,
            message: 'Du bist bereits Mitglied dieser Gruppe.',
          },
        };
      }

      await postgres.exec(
        'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
        [group.id, userId, 'member']
      );

      const joinerName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';
      void notifyGroupMembers({
        groupId: group.id,
        excludeUserId: userId,
        type: 'group_member_joined',
        title: 'Neues Mitglied',
        body: `${joinerName} ist „${group.name}" beigetreten`,
        actionUrl: `/gruppen/${group.id}`,
      }).catch(() => {});

      return {
        status: 200 as const,
        body: {
          success: true as const,
          group,
          message: `Erfolgreich der Gruppe "${group.name}" beigetreten.`,
        },
      };
    } catch (error) {
      log.error('[groupsContract.joinByToken] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Beitritt zur Gruppe.' },
      };
    }
  },

  leaveGroup: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const row = (await postgres.queryOne(
        `SELECT gm.role, g.created_by, g.name
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
          WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      )) as { role: string; created_by: string; name: string } | null;

      if (!row) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Du bist nicht Mitglied dieser Gruppe.' },
        };
      }

      if (String(row.created_by) === String(userId)) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message:
              'Als Gruppenersteller*in kannst du die Gruppe nicht verlassen. Lösche sie stattdessen.',
          },
        };
      }

      const result = await postgres.exec(
        'DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [groupId, userId]
      );
      if (result.changes === 0) throw new Error('Mitgliedschaft konnte nicht entfernt werden.');

      const leaverName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';
      void notifyGroupMembers({
        groupId,
        excludeUserId: userId,
        type: 'group_member_left',
        title: 'Mitglied ausgetreten',
        body: `${leaverName} hat „${row.name}" verlassen`,
        actionUrl: `/gruppen/${groupId}`,
      }).catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Gruppe erfolgreich verlassen.' },
      };
    } catch (error) {
      log.error('[groupsContract.leaveGroup] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Verlassen der Gruppe.' },
      };
    }
  },

  listMembers: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const members = (await postgres.query(
        `SELECT gm.user_id, gm.role, gm.joined_at, p.first_name, p.display_name, p.avatar_robot_id
           FROM group_memberships gm
           INNER JOIN profiles p ON p.id = gm.user_id
          WHERE gm.group_id = $1
          ORDER BY gm.joined_at ASC`,
        [groupId],
        { table: 'group_memberships' }
      )) as Array<{
        user_id: string;
        role: string;
        joined_at: string | Date | null;
        first_name: string | null;
        display_name: string | null;
        avatar_robot_id: number | null;
      }>;

      return {
        status: 200 as const,
        body: {
          success: true as const,
          members: (members || []).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            joined_at: toIsoOrNull(m.joined_at),
            first_name: m.first_name ?? null,
            display_name: m.display_name ?? null,
            avatar_robot_id: m.avatar_robot_id ?? 1,
          })),
        },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.listMembers] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Gruppenmitglieder.' },
      };
    }
  },

  updateMemberRole: async (args) => {
    const { groupId, memberId } = args.params;
    const { role } = args.body;
    try {
      const userId = getUserId(args.req);
      if (String(memberId) === String(userId)) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Du kannst deine eigene Rolle nicht ändern.' },
        };
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const [group, targetMembership] = await Promise.all([
        postgres.queryOne('SELECT created_by, name FROM groups WHERE id = $1', [groupId], {
          table: 'groups',
        }) as Promise<{ created_by: string; name: string } | null>,
        postgres.queryOne(
          'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
          [groupId, memberId],
          { table: 'group_memberships' }
        ) as Promise<{ role: string } | null>,
      ]);

      if (group && String(group.created_by) === String(memberId)) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: 'Die Rolle der Gruppenersteller*in kann nicht geändert werden.',
          },
        };
      }

      if (!targetMembership) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Mitglied nicht in dieser Gruppe gefunden.' },
        };
      }

      await postgres.exec(
        'UPDATE group_memberships SET role = $1 WHERE group_id = $2 AND user_id = $3',
        [role, groupId, memberId]
      );

      void createNotification({
        userId: memberId,
        type: 'group_role_changed',
        title: 'Rolle geändert',
        body: `Du bist jetzt ${role === 'admin' ? 'Admin' : 'Mitglied'} in „${group?.name || 'deiner Gruppe'}"`,
        actionUrl: `/gruppen/${groupId}`,
        metadata: { groupId, role },
        groupKey: `group:${groupId}`,
      }).catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Rolle erfolgreich aktualisiert.' },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.updateMemberRole] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren der Rolle.' },
      };
    }
  },

  addLink: async (args) => {
    const { groupId } = args.params;
    const MAX_LINKS = 20;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
      const body: GroupLinkBody = args.body;

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: StoredGroupLink[] | null } | null;

      const links = group?.links || [];
      if (links.length >= MAX_LINKS) {
        return {
          status: 400 as const,
          body: { success: false as const, message: `Maximal ${MAX_LINKS} Links pro Gruppe.` },
        };
      }

      const newLink: StoredGroupLink = {
        id: crypto.randomUUID(),
        title: body.title.trim(),
        url: body.url.trim(),
        icon: body.icon,
        ...(body.description?.trim() ? { description: body.description.trim() } : {}),
      };
      links.push(newLink);

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      return { status: 200 as const, body: { success: true as const, link: newLink } };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.addLink] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Hinzufügen des Links.' },
      };
    }
  },

  updateLink: async (args) => {
    const { groupId, linkId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
      const body: GroupLinkBody = args.body;

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: StoredGroupLink[] | null } | null;

      const links = group?.links || [];
      const idx = links.findIndex((l) => l.id === linkId);
      if (idx === -1) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Link nicht gefunden.' },
        };
      }

      links[idx] = {
        ...links[idx],
        title: body.title.trim(),
        url: body.url.trim(),
        icon: body.icon,
        ...(body.description?.trim() ? { description: body.description.trim() } : {}),
      };
      if (!body.description?.trim()) delete links[idx].description;

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      return { status: 200 as const, body: { success: true as const, link: links[idx] } };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.updateLink] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren des Links.' },
      };
    }
  },

  deleteLink: async (args) => {
    const { groupId, linkId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: StoredGroupLink[] | null } | null;

      const links = (group?.links || []).filter((l) => l.id !== linkId);

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.deleteLink] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Löschen des Links.' },
      };
    }
  },
});

export function mountGroupsContractRouter(app: Application): void {
  createExpressEndpoints(groupsContract, groupsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'groupsContract'),
  });
}
