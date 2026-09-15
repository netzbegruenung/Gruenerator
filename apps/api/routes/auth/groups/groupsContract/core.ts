/**
 * Core group CRUD / membership / link routes (migrated 1:1 from the legacy raw
 * routes). Each handler is bound to its contract route via `s.route(...)` so the
 * spread into `s.router(...)` in `index.ts` stays fully type-inferred.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { groupsContract } from '@gruenerator/contracts';
import { extractSlugSuffix } from '@gruenerator/shared/utils';

import { PRIMARY_URL } from '../../../../config/domains.js';
import { getPostgresInstance } from '../../../../database/services/PostgresService.js';
import { sendGroupInviteEmail } from '../../../../services/email/index.js';
import {
  createGroupForUser,
  joinGroupByToken,
  updateGroupInfo,
} from '../../../../services/groups/groupMutations.js';
import {
  createNotification,
  notifyGroupMembers,
} from '../../../../services/notifications/index.js';
import { getPostgresAndCheckMembership } from '../groupCore.js';

import {
  s,
  log,
  getUserId,
  toIsoOrNull,
  groupErrorResponse,
  AVATAR_UPLOAD_DIR,
  type StoredGroupLink,
} from './shared.js';

import type { UserProfile } from '../../../../services/user/types.js';
import type { GroupLinkBody } from '@gruenerator/contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const coreRoutes = {
  listUserGroups: s.route(groupsContract.listUserGroups, async (args) => {
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
        `SELECT g.id, g.name, g.description, g.created_at, g.created_by, g.join_token, g.settings,
                g.avatar_url, g.links, g.slug_suffix, g.group_type,
                (SELECT COUNT(*)::int FROM group_memberships gm WHERE gm.group_id = g.id) AS member_count
           FROM groups g WHERE g.id = ANY($1)`,
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
        group_type: 'standard' | 'personal' | null;
        member_count: number;
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
          group_type: group.group_type ?? 'standard',
          member_count: group.member_count,
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
  }),

  resolveGroup: s.route(groupsContract.resolveGroup, async (args) => {
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
  }),

  createGroup: s.route(groupsContract.createGroup, async (args) => {
    try {
      const userId = getUserId(args.req);
      const newGroup = await createGroupForUser(userId, args.body);

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
  }),

  deleteGroup: s.route(groupsContract.deleteGroup, async (args) => {
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
  }),

  getDetails: s.route(groupsContract.getDetails, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const row = (await postgres.queryOne(
        `SELECT gm.role, gm.joined_at, gm.notifications_muted,
                g.id, g.name, g.description, g.created_at, g.created_by, g.join_token,
                g.settings, g.avatar_url, g.links, g.is_public, g.audience, g.slug_suffix,
                g.group_type
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
          WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      )) as {
        role: string;
        joined_at: string | Date | null;
        notifications_muted: boolean | null;
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
        group_type: 'standard' | 'personal' | null;
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
            group_type: row.group_type ?? 'standard',
            slug_suffix: row.slug_suffix ?? null,
          },
          membership: {
            role: row.role,
            joined_at: toIsoOrNull(row.joined_at),
            isAdmin,
            notifications_muted: row.notifications_muted ?? false,
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
  }),

  updateInfo: s.route(groupsContract.updateInfo, async (args) => {
    const { groupId } = args.params;
    const { name, description, settings } = args.body;
    try {
      const userId = getUserId(args.req);
      const outcome = await updateGroupInfo(groupId, userId, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(settings !== undefined ? { settings } : {}),
      });
      switch (outcome.status) {
        case 200:
          return {
            status: 200 as const,
            body: { success: true as const, message: outcome.message },
          };
        case 400:
          return {
            status: 400 as const,
            body: { success: false as const, message: outcome.message },
          };
        case 403:
          return {
            status: 403 as const,
            body: { success: false as const, message: outcome.message },
          };
      }
    } catch (error) {
      log.error('[groupsContract.updateInfo] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Aktualisieren der Gruppendetails.' },
      };
    }
  }),

  updateName: s.route(groupsContract.updateName, async (args) => {
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
      return groupErrorResponse(
        'updateName',
        'Fehler beim Aktualisieren des Gruppennamens.',
        error
      );
    }
  }),

  verifyToken: s.route(groupsContract.verifyToken, async (args) => {
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
  }),

  joinByToken: s.route(groupsContract.joinByToken, async (args) => {
    try {
      const userId = getUserId(args.req);
      const { joinToken } = args.body;
      const joinerName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';

      const outcome = await joinGroupByToken(userId, joinToken, joinerName);

      if (!outcome) {
        return {
          status: 404 as const,
          body: {
            success: false as const,
            message: 'Ungültiger oder abgelaufener Einladungslink.',
          },
        };
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          group: outcome.group,
          alreadyMember: outcome.alreadyMember,
          message: outcome.alreadyMember
            ? 'Du bist bereits Mitglied dieser Gruppe.'
            : `Erfolgreich der Gruppe "${outcome.group.name}" beigetreten.`,
        },
      };
    } catch (error) {
      log.error('[groupsContract.joinByToken] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Beitritt zur Gruppe.' },
      };
    }
  }),

  invite: s.route(groupsContract.invite, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const inviterName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';

      let postgres: ReturnType<typeof getPostgresInstance>;
      try {
        ({ postgres } = await getPostgresAndCheckMembership(groupId, userId, true));
      } catch {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Keine Berechtigung, zu dieser Gruppe einzuladen.',
          },
        };
      }

      const group = (await postgres.queryOne(
        'SELECT name, join_token FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { name: string; join_token: string | null } | null;

      if (!group?.join_token) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gruppe nicht gefunden.' },
        };
      }

      const joinUrl = `${PRIMARY_URL}/join-group/${group.join_token}`;
      // Dedupe + normalize; Zod already validated format and the ≤50 cap.
      const emails = Array.from(
        new Set(args.body.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
      );

      const results = await Promise.all(
        emails.map((email) =>
          sendGroupInviteEmail({
            recipientEmail: email,
            groupName: group.name,
            inviterName,
            joinUrl,
          })
        )
      );

      const failed = emails.filter((_, i) => !results[i]);
      return {
        status: 200 as const,
        body: { success: true as const, sent: emails.length - failed.length, failed },
      };
    } catch (error) {
      log.error('[groupsContract.invite] Error:', error);
      return {
        status: 500 as const,
        body: { success: false as const, message: 'Fehler beim Versenden der Einladungen.' },
      };
    }
  }),

  leaveGroup: s.route(groupsContract.leaveGroup, async (args) => {
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
  }),

  setGroupMute: s.route(groupsContract.setGroupMute, async (args) => {
    const { groupId } = args.params;
    const { muted } = args.body;
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const result = await postgres.exec(
        'UPDATE group_memberships SET notifications_muted = $1 WHERE group_id = $2 AND user_id = $3',
        [muted, groupId, userId]
      );

      if (result.changes === 0) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Du bist nicht Mitglied dieser Gruppe.' },
        };
      }

      return { status: 200 as const, body: { success: true as const, muted } };
    } catch (error) {
      log.error('[groupsContract.setGroupMute] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: 'Fehler beim Aktualisieren der Benachrichtigungen.',
        },
      };
    }
  }),

  listMembers: s.route(groupsContract.listMembers, async (args) => {
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
      return groupErrorResponse('listMembers', 'Fehler beim Laden der Gruppenmitglieder.', error);
    }
  }),

  updateMemberRole: s.route(groupsContract.updateMemberRole, async (args) => {
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
      return groupErrorResponse('updateMemberRole', 'Fehler beim Aktualisieren der Rolle.', error);
    }
  }),

  addLink: s.route(groupsContract.addLink, async (args) => {
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
      return groupErrorResponse('addLink', 'Fehler beim Hinzufügen des Links.', error);
    }
  }),

  updateLink: s.route(groupsContract.updateLink, async (args) => {
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
      return groupErrorResponse('updateLink', 'Fehler beim Aktualisieren des Links.', error);
    }
  }),

  deleteLink: s.route(groupsContract.deleteLink, async (args) => {
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
      return groupErrorResponse('deleteLink', 'Fehler beim Löschen des Links.', error);
    }
  }),
};
