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
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { v4 as uuidv4 } from 'uuid';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  createNotification,
  notifyGroupAdmins,
  notifyGroupMembers,
} from '../../../services/notifications/index.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { NextcloudShareManager } from '../../../utils/integrations/nextcloud/index.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type { UserProfile } from '../../../services/user/types.js';
import type { GroupLinkBody } from '@gruenerator/contracts';
import type { Application, Request } from 'express';

const log = createLogger('groupsContractRouter');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../../uploads/group-avatars');

const notebookHelper = new NotebookQdrantHelper();

// ── Content-sharing module state (ported from groupContent.ts) ────────────────

interface ShareRecord {
  content_type: string;
  content_id: string;
  shared_at: string;
  permissions: string | Record<string, unknown>;
  shared_by_user_id: string;
  first_name: string | null;
  display_name: string | null;
}

interface ContentItem {
  id: string;
  [key: string]: unknown;
}

interface SystemTemplate {
  id: string;
  title: string;
  description: string;
  template_type: string;
  thumbnail_url: string;
  preview_image?: string;
  external_url: string;
  tags: string[];
  categories: string[];
}

let systemTemplates: SystemTemplate[] = [];
try {
  const systemTemplatesPath = path.resolve(process.cwd(), 'config/templates/system-templates.json');
  const parsed = JSON.parse(fs.readFileSync(systemTemplatesPath, 'utf-8')) as {
    templates?: Array<SystemTemplate & { preview_image?: string }>;
  };
  systemTemplates = (parsed.templates ?? []).map((t) => ({
    ...t,
    thumbnail_url: t.preview_image ? `/auth/template-previews/${t.preview_image}` : t.thumbnail_url,
  }));
} catch {
  log.warn('[groupsContract] Could not load system templates for vorlagen matching');
}

const CONTENT_TABLE_NAME_MAP: Record<string, string> = {
  database: 'user_templates',
  template: 'user_templates',
  user_templates: 'user_templates',
  instructions: 'user_instructions',
  user_instructions: 'user_instructions',
  canvas_template: 'collaborative_documents',
};

const CONTENT_LABELS: Record<string, string> = {
  documents: 'ein Dokument',
  custom_generators: 'einen Grünerator',
  notebook_collections: 'ein Notizbuch',
  user_documents: 'einen Text',
  collaborative_documents: 'ein Dokument',
  database: 'einen Datenbank-Eintrag',
  system_notebooks: 'ein Notizbuch',
  system_agents: 'einen Agenten',
  canvas_template: 'eine Sharepic-Vorlage',
  nextcloud_share_link: 'eine Wolke-Verbindung',
};

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
        'SELECT id, name, description, created_at, created_by, join_token, settings, avatar_url, links FROM groups WHERE id = ANY($1)',
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

  createGroup: async (args) => {
    try {
      const userId = getUserId(args.req);
      const name = args.body.name.trim();
      const joinToken = crypto.randomBytes(16).toString('hex');
      const groupId = uuidv4();
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const newGroup = await postgres.transaction(async (client) => {
        const group = (await postgres.transactionQueryOne(
          client,
          `INSERT INTO groups (id, name, created_by, join_token, description)
             VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, description, created_at, created_by, join_token`,
          [groupId, name, userId, joinToken, null]
        )) as {
          id: string;
          name: string;
          description: string | null;
          created_at: string | Date | null;
          created_by: string | null;
          join_token: string | null;
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
                g.settings, g.avatar_url, g.links, g.is_public, g.audience
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

  // ── Content sharing (migrated from legacy groupContent.ts) ──────────────────

  shareContent: async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId, permissions } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      if (contentType === 'nextcloud_share_link') {
        try {
          await NextcloudShareManager.getShareLinkById(userId, contentId);
        } catch {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Wolke-Verbindung nicht gefunden.' },
          };
        }
      }

      if (contentType === 'notebook_collections') {
        const collection = await notebookHelper.getNotebookCollection(contentId);
        if (!collection) {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Inhalt nicht gefunden.' },
          };
        }
        if (collection.user_id !== userId) {
          return {
            status: 403 as const,
            body: { success: false as const, message: 'Du bist nicht Besitzer*in dieses Inhalts.' },
          };
        }
      }

      if (
        contentType !== 'system_notebooks' &&
        contentType !== 'system_agents' &&
        contentType !== 'nextcloud_share_link' &&
        contentType !== 'notebook_collections'
      ) {
        const tableName = CONTENT_TABLE_NAME_MAP[contentType] || contentType;
        const ownerColumn =
          contentType === 'collaborative_documents' || contentType === 'canvas_template'
            ? 'created_by'
            : 'user_id';

        let ownershipSQL = `SELECT ${ownerColumn} FROM ${tableName} WHERE id = $1`;
        const ownershipParams: string[] = [contentId];
        if (tableName === 'user_templates') {
          ownershipSQL += ` AND type = $2`;
          ownershipParams.push('template');
        }
        if (contentType === 'collaborative_documents') {
          ownershipSQL += ` AND is_deleted = false`;
        }
        if (contentType === 'canvas_template') {
          ownershipSQL += ` AND is_deleted = false AND document_subtype = 'canvas'`;
        }

        const contentOwnership = await postgres.queryOne<{ [key: string]: string }>(
          ownershipSQL,
          ownershipParams,
          { table: tableName }
        );

        if (!contentOwnership) {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Inhalt nicht gefunden.' },
          };
        }
        if (contentOwnership[ownerColumn] !== userId) {
          return {
            status: 403 as const,
            body: { success: false as const, message: 'Du bist nicht Besitzer*in dieses Inhalts.' },
          };
        }
      }

      const existingShare = await postgres.queryOne<{ id: string }>(
        'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (existingShare) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: 'Inhalt ist bereits mit dieser Gruppe geteilt.',
          },
        };
      }

      const sharePermissions = permissions ?? { read: true, write: false, collaborative: false };
      await postgres.exec(
        'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions) VALUES ($1, $2, $3, $4, $5)',
        [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions)]
      );

      const sharerName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';
      void postgres
        .queryOne('SELECT name FROM groups WHERE id = $1', [groupId], { table: 'groups' })
        .then((g) =>
          notifyGroupMembers({
            groupId,
            excludeUserId: userId,
            type: 'group_content_shared',
            title: 'Neuer Inhalt',
            body: `${sharerName} hat ${CONTENT_LABELS[contentType] || 'etwas'} in „${(g as { name?: string } | null)?.name || 'deiner Gruppe'}" geteilt`,
            actionUrl: `/gruppen/${groupId}`,
            metadata: { contentType, contentId },
          })
        )
        .catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inhalt erfolgreich mit der Gruppe geteilt.' },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.shareContent] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Teilen des Inhalts.' },
      };
    }
  },

  unshareContent: async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Geteilter Inhalt nicht gefunden.' },
        };
      }
      if (shareRecord.shared_by_user_id !== userId) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Du kannst nur Inhalte aufheben, die du selbst geteilt hast.',
          },
        };
      }

      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or already deleted');

      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Inhalt wurde erfolgreich aus der Gruppe entfernt.',
        },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.unshareContent] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: 'Fehler beim Entfernen des Inhalts aus der Gruppe.',
        },
      };
    }
  },

  listGroupContent: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const sharedContent =
        ((await postgres.query(
          `SELECT gcs.content_type, gcs.content_id, gcs.shared_at, gcs.permissions,
                  gcs.shared_by_user_id, p.first_name, p.display_name
             FROM group_content_shares gcs
             LEFT JOIN profiles p ON p.id = gcs.shared_by_user_id
            WHERE gcs.group_id = $1
            ORDER BY gcs.shared_at DESC`,
          [groupId],
          { table: 'group_content_shares' }
        )) as ShareRecord[]) || [];

      const contentByType: Record<string, ShareRecord[]> = {
        documents: [],
        custom_generators: [],
        notebook_collections: [],
        user_documents: [],
        database: [],
        collaborative_documents: [],
        system_notebooks: [],
        system_agents: [],
        canvas_template: [],
      };
      sharedContent.forEach((share) => {
        if (contentByType[share.content_type]) contentByType[share.content_type].push(share);
      });

      type ContentResult = {
        type: string;
        result: { data: Array<Record<string, unknown>> };
        shares: ShareRecord[];
      };
      const fetchPromises: Promise<ContentResult | null>[] = [];

      if (contentByType.documents.length > 0) {
        const ids = contentByType.documents.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1)',
              [ids],
              { table: 'documents' }
            )
            .then((data) => ({
              type: 'documents',
              result: { data: data || [] },
              shares: contentByType.documents,
            }))
        );
      }
      if (contentByType.custom_generators.length > 0) {
        const ids = contentByType.custom_generators.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, name, title, description, created_at, updated_at, user_id FROM custom_generators WHERE id = ANY($1)',
              [ids],
              { table: 'custom_generators' }
            )
            .then((data) => ({
              type: 'custom_generators',
              result: { data: data || [] },
              shares: contentByType.custom_generators,
            }))
        );
      }
      if (contentByType.notebook_collections.length > 0) {
        const ids = contentByType.notebook_collections.map((s) => s.content_id);
        fetchPromises.push(
          notebookHelper.getNotebookCollectionsByIds(ids).then((collections) => ({
            type: 'notebook_collections',
            result: {
              data: collections.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                created_at: c.created_at,
                updated_at: c.updated_at,
                user_id: c.user_id,
              })),
            },
            shares: contentByType.notebook_collections,
          }))
        );
      }
      if (contentByType.system_notebooks.length > 0) {
        fetchPromises.push(
          Promise.resolve({
            type: 'system_notebooks',
            result: {
              data: contentByType.system_notebooks.map((s) => ({ id: s.content_id, system: true })),
            },
            shares: contentByType.system_notebooks,
          })
        );
      }
      if (contentByType.system_agents.length > 0) {
        fetchPromises.push(
          Promise.resolve({
            type: 'system_agents',
            result: {
              data: contentByType.system_agents.map((s) => ({ id: s.content_id, system: true })),
            },
            shares: contentByType.system_agents,
          })
        );
      }
      if (contentByType.user_documents.length > 0) {
        const ids = contentByType.user_documents.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1)',
              [ids],
              { table: 'user_documents' }
            )
            .then((rawData) => {
              const textsData = ((rawData || []) as Array<ContentItem & { content?: string }>).map(
                (item) => {
                  let plainText = item.content || '';
                  let prev = '';
                  while (prev !== plainText) {
                    prev = plainText;
                    plainText = plainText.replace(/<[^>]*>/g, '');
                  }
                  plainText = plainText.trim();
                  const wordCount = plainText.split(/\s+/).filter((w) => w.length > 0).length;
                  return { ...item, word_count: wordCount, character_count: plainText.length };
                }
              );
              return {
                type: 'user_documents',
                result: { data: textsData },
                shares: contentByType.user_documents,
              };
            })
        );
      }
      if (contentByType.database.length > 0) {
        const ids = contentByType.database.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              "SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template'",
              [ids],
              { table: 'user_templates' }
            )
            .then((data) => ({
              type: 'database',
              result: { data: data || [] },
              shares: contentByType.database,
            }))
        );
      }
      if (contentByType.collaborative_documents.length > 0) {
        const ids = contentByType.collaborative_documents.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, document_subtype, created_by, created_at, updated_at FROM collaborative_documents WHERE id = ANY($1::uuid[]) AND is_deleted = false',
              [ids],
              { table: 'collaborative_documents' }
            )
            .then((data) => ({
              type: 'collaborative_documents',
              result: { data: data || [] },
              shares: contentByType.collaborative_documents,
            }))
        );
      }
      if (contentByType.canvas_template.length > 0) {
        const ids = contentByType.canvas_template.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              `SELECT cd.id, cd.title, cd.created_by, cd.created_at, cd.updated_at,
                      cdoc.template_type, cdoc.thumbnail_url, cdoc.format
                 FROM collaborative_documents cd
                 INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
                WHERE cd.id = ANY($1::uuid[]) AND cd.is_deleted = false AND cd.document_subtype = 'canvas'`,
              [ids],
              { table: 'collaborative_documents' }
            )
            .then((data) => ({
              type: 'canvas_template',
              result: { data: data || [] },
              shares: contentByType.canvas_template,
            }))
        );
      }

      const contentResults = (await Promise.all(fetchPromises)).filter(Boolean) as ContentResult[];

      const groupContent: {
        documents: Record<string, unknown>[];
        generators: Record<string, unknown>[];
        notebooks: Record<string, unknown>[];
        texts: Record<string, unknown>[];
        templates: Record<string, unknown>[];
        collaborative_documents: Record<string, unknown>[];
        system_notebooks: Record<string, unknown>[];
        system_agents: Record<string, unknown>[];
        canvas_templates: Record<string, unknown>[];
      } = {
        documents: [],
        generators: [],
        notebooks: [],
        texts: [],
        templates: [],
        collaborative_documents: [],
        system_notebooks: [],
        system_agents: [],
        canvas_templates: [],
      };

      const keyMap: Record<string, keyof typeof groupContent> = {
        documents: 'documents',
        custom_generators: 'generators',
        notebook_collections: 'notebooks',
        user_documents: 'texts',
        database: 'templates',
        collaborative_documents: 'collaborative_documents',
        system_notebooks: 'system_notebooks',
        system_agents: 'system_agents',
        canvas_template: 'canvas_templates',
      };

      contentResults.forEach(({ type, result, shares }) => {
        const items = (result.data || []).map((item) => {
          const shareInfo = shares.find((s) => s.content_id === item.id);
          const parsedPermissions: Record<string, unknown> =
            typeof shareInfo?.permissions === 'string'
              ? (JSON.parse(shareInfo.permissions) as Record<string, unknown>)
              : ((shareInfo?.permissions as Record<string, unknown> | null) ?? {});
          const parsedMetadata: Record<string, unknown> =
            type === 'database' && item.metadata != null
              ? typeof item.metadata === 'string'
                ? (JSON.parse(item.metadata) as Record<string, unknown>)
                : (item.metadata as Record<string, unknown>)
              : {};
          return {
            ...item,
            contentType: type,
            shared_at: shareInfo?.shared_at,
            group_permissions: parsedPermissions,
            shared_by_name: shareInfo?.display_name || shareInfo?.first_name || 'Unknown User',
            ...(type === 'database' && {
              template_type: (parsedMetadata.template_type as string) || 'template',
              external_url: item.external_url,
            }),
          };
        });
        const key = keyMap[type];
        if (key) groupContent[key] = items;
      });

      return { status: 200 as const, body: { success: true as const, content: groupContent } };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.listGroupContent] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Gruppeninhalte.' },
      };
    }
  },

  updateContentPermissions: async (args) => {
    const { groupId, contentId } = args.params;
    const { contentType, permissions } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Inhalt ist nicht mit dieser Gruppe geteilt.' },
        };
      }

      const isAdmin = membership.role === 'admin';
      const isSharer = shareRecord.shared_by_user_id === userId;
      if (!isAdmin && !isSharer) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Keine Berechtigung zum Ändern der Berechtigungen.',
          },
        };
      }

      const result = await postgres.exec(
        'UPDATE group_content_shares SET permissions = $1 WHERE content_type = $2 AND content_id = $3 AND group_id = $4',
        [JSON.stringify(permissions), contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or no changes made');

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Berechtigungen erfolgreich aktualisiert.' },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.updateContentPermissions] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren der Berechtigungen.' },
      };
    }
  },

  removeGroupContent: async (args) => {
    const { groupId, contentId } = args.params;
    const { contentType } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      if (membership.role !== 'admin') {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Nur Gruppenadministratoren können geteilte Inhalte entfernen.',
          },
        };
      }

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Geteilter Inhalt nicht gefunden.' },
        };
      }

      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or already deleted');

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inhalt erfolgreich aus der Gruppe entfernt.' },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.removeGroupContent] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Entfernen des geteilten Inhalts.' },
      };
    }
  },

  listGroupVorlagen: async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const group = await postgres.queryOne(
        'SELECT settings FROM groups WHERE id = $1',
        [groupId],
        {
          table: 'groups',
        }
      );
      const settings =
        typeof group?.settings === 'string'
          ? (JSON.parse(group.settings) as { templateTags?: string[] })
          : ((group?.settings as { templateTags?: string[] } | null) ?? {});
      const templateTags: string[] = settings.templateTags ?? [];

      if (templateTags.length === 0) {
        return {
          status: 200 as const,
          body: { success: true as const, vorlagen: [], tags: [] },
        };
      }

      const dbTemplates = (await postgres.query(
        `SELECT id, title, description, template_type, thumbnail_url, external_url,
                tags, categories, metadata, created_at
           FROM user_templates
          WHERE is_private = false AND status = 'published' AND type = 'template'
            AND tags ?| $1::text[]
          ORDER BY created_at DESC`,
        [templateTags],
        { table: 'user_templates' }
      )) as Array<Record<string, unknown> & SystemTemplate>;

      const lowerTags = templateTags.map((t) => t.toLowerCase());
      const matchingSystemTemplates = systemTemplates
        .filter((t) => {
          const tTags = (t.tags || []).map((tag) => tag.toLowerCase());
          const tCategories = (t.categories || []).map((c) => c.toLowerCase());
          const tType = (t.template_type || '').toLowerCase();
          return lowerTags.some(
            (groupTag) =>
              tTags.includes(groupTag) || tCategories.includes(groupTag) || tType === groupTag
          );
        })
        .map((t) => ({ ...t, is_system: true }));

      const seenIds = new Set<string>();
      const vorlagen: Record<string, unknown>[] = [];
      for (const t of [...(dbTemplates || []), ...matchingSystemTemplates]) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          vorlagen.push({
            id: t.id,
            title: t.title,
            description: t.description,
            template_type: t.template_type,
            thumbnail_url: t.thumbnail_url,
            external_url: t.external_url,
            tags: t.tags || [],
            categories: (t as Record<string, unknown>).categories || [],
            is_system: !!(t as { is_system?: boolean }).is_system,
            created_at: 'created_at' in t ? t.created_at : null,
          });
        }
      }

      return {
        status: 200 as const,
        body: { success: true as const, vorlagen, tags: templateTags },
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return {
          status: 403 as const,
          body: { success: false as const, message: (error as Error).message },
        };
      }
      log.error('[groupsContract.listGroupVorlagen] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Laden der Vorlagen.' },
      };
    }
  },
});

export function mountGroupsContractRouter(app: Application): void {
  createExpressEndpoints(groupsContract, groupsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'groupsContract'),
  });
}
