/**
 * Group core management routes
 * Handles group CRUD, join/leave, and membership operations
 */

import crypto from 'crypto';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import express, { type Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('userGroups');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../../uploads/group-avatars');

const router: Router = express.Router();

// ============================================================================
// Helper Functions
// ============================================================================

interface MembershipCheckResult {
  postgres: ReturnType<typeof getPostgresInstance>;
  membership: { role: string };
}

/**
 * Helper function to get PostgreSQL instance and check user membership
 */
export async function getPostgresAndCheckMembership(
  groupId: string,
  userId: string,
  requireAdmin: boolean = false
): Promise<MembershipCheckResult> {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const membership = (await postgres.queryOne(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
    { table: 'group_memberships' }
  )) as { role: string } | null;

  if (!membership) {
    throw new Error('Du bist nicht Mitglied dieser Gruppe.');
  }

  if (requireAdmin && membership.role !== 'admin') {
    // Check if user is group creator
    const group = await postgres.queryOne(
      'SELECT created_by FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!group || group.created_by !== userId) {
      throw new Error('Keine Berechtigung für diese Aktion.');
    }
  }

  return { postgres, membership };
}

// ============================================================================
// Groups Management Endpoints
// ============================================================================

// Get user groups
router.get(
  '/groups',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Get user's group memberships
      const memberships = await postgres.query(
        'SELECT group_id, role, joined_at FROM group_memberships WHERE user_id = $1',
        [userId],
        { table: 'group_memberships' }
      );

      if (!memberships || memberships.length === 0) {
        res.json({
          success: true,
          groups: [],
        });
        return;
      }

      const groupIds = memberships.map((m: any) => m.group_id);

      // Get group details
      const groupsData = await postgres.query(
        'SELECT id, name, description, created_at, created_by, join_token, settings, avatar_url, links FROM groups WHERE id = ANY($1)',
        [groupIds],
        { table: 'groups' }
      );

      // Build a lookup map to avoid repeated .find() calls
      const membershipByGroupId = new Map(memberships.map((m: any) => [m.group_id, m]));

      const combinedGroups = (groupsData || []).map((group: any) => {
        const membership = membershipByGroupId.get(group.id);
        const role = membership?.role || 'member';
        return {
          ...group,
          role,
          joined_at: membership?.joined_at,
          isAdmin: group.created_by === userId || role === 'admin',
        };
      });

      res.json({
        success: true,
        groups: combinedGroups,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Gruppen.',
      });
    }
  }
);

// Create a new group
router.post(
  '/groups',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;

      if (!name?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Gruppenname ist erforderlich.',
        });
        return;
      }

      const userId = req.user!.id;
      const joinToken = crypto.randomBytes(16).toString('hex');
      const groupId = uuidv4();
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Create group, membership and instructions in a transaction
      const newGroup = await postgres.transaction(async (client: any) => {
        // 1. Create the group
        const group = await postgres.transactionQueryOne(
          client,
          `INSERT INTO groups (id, name, created_by, join_token, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, description, created_at, created_by, join_token`,
          [groupId, name.trim(), userId, joinToken, null]
        );

        if (!group) {
          throw new Error('Failed to create group');
        }

        // 2. Create membership for the creator with admin role
        await postgres.transactionExec(
          client,
          'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
          [group.id, userId, 'admin']
        );

        return group;
      });

      res.json({
        success: true,
        group: {
          ...newGroup,
          role: 'admin',
          isAdmin: true,
          joined_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Erstellen der Gruppe.',
      });
    }
  }
);

// Delete a group
router.delete(
  '/groups/:groupId',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Check if user is authorized to delete the group (creator or admin)
      const groupData = (await postgres.queryOne(
        'SELECT name, created_by, avatar_url FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      )) as { name: string; created_by: string; avatar_url?: string | null } | null;

      if (!groupData) {
        res.status(404).json({
          success: false,
          message: 'Gruppe nicht gefunden.',
        });
        return;
      }

      const isCreator = groupData.created_by === userId;

      if (!isCreator) {
        // Check if user is admin
        const membership = await postgres.queryOne(
          'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
          [groupId, userId],
          { table: 'group_memberships' }
        );

        if (!membership || membership.role !== 'admin') {
          res.status(403).json({
            success: false,
            message: 'Keine Berechtigung zum Löschen dieser Gruppe.',
          });
          return;
        }
      }

      // Notify members before deletion (memberships still exist)
      const { notifyGroupMembers } = await import('../../../services/notifications/index.js');
      await notifyGroupMembers({
        groupId,
        excludeUserId: userId,
        type: 'group_deleted',
        title: 'Gruppe aufgelöst',
        body: `„${groupData.name}" wurde aufgelöst`,
        actionUrl: '/gruppen',
      });

      // Delete in correct order using transaction to ensure data integrity
      await postgres.transaction(async (client: any) => {
        // 1. Delete group instructions (deprecated table, clean up remaining rows)
        await postgres.transactionExec(
          client,
          'DELETE FROM group_instructions WHERE group_id = $1',
          [groupId]
        );

        // 3. Delete group content shares
        await postgres.transactionExec(
          client,
          'DELETE FROM group_content_shares WHERE group_id = $1',
          [groupId]
        );

        // 4. Delete group memberships
        await postgres.transactionExec(
          client,
          'DELETE FROM group_memberships WHERE group_id = $1',
          [groupId]
        );

        // 5. Delete the group itself
        const result = await postgres.transactionExec(client, 'DELETE FROM groups WHERE id = $1', [
          groupId,
        ]);

        if (result.changes === 0) {
          throw new Error('Group not found or already deleted');
        }
      });

      if (groupData?.avatar_url) {
        const avatarPath = path.join(AVATAR_UPLOAD_DIR, path.basename(groupData.avatar_url));
        fs.promises.unlink(avatarPath).catch(() => {});
      }

      res.json({
        success: true,
        message: 'Gruppe erfolgreich gelöscht.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Löschen der Gruppe.',
      });
    }
  }
);

// Verify join token (for JoinGroupPage)
router.get(
  '/groups/verify-token/:joinToken',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ joinToken: string }>, res: Response): Promise<void> => {
    try {
      const { joinToken } = req.params;
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      if (!joinToken?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Beitritts-Token ist erforderlich.',
        });
        return;
      }

      // 1. Get the group from the token
      const group = (await postgres.queryOne(
        'SELECT id, name FROM groups WHERE join_token = $1',
        [joinToken.trim()],
        { table: 'groups' }
      )) as { id: string; name: string } | null;

      if (!group) {
        res.status(404).json({
          success: false,
          message: 'Ungültiger oder abgelaufener Einladungslink.',
        });
        return;
      }

      // 2. Check if already a member
      const existingMembership = await postgres.queryOne(
        'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group.id, userId],
        { table: 'group_memberships' }
      );

      res.json({
        success: true,
        group: group,
        alreadyMember: !!existingMembership,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/verify-token GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Überprüfen des Einladungslinks.',
      });
    }
  }
);

// Join a group with token
router.post(
  '/groups/join',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { joinToken } = req.body;
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      if (!joinToken?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Beitritts-Token ist erforderlich.',
        });
        return;
      }

      // 1. Get the group from the token
      const group = (await postgres.queryOne(
        'SELECT id, name FROM groups WHERE join_token = $1',
        [joinToken.trim()],
        { table: 'groups' }
      )) as { id: string; name: string } | null;

      if (!group) {
        res.status(404).json({
          success: false,
          message: 'Ungültiger oder abgelaufener Einladungslink.',
        });
        return;
      }

      // 2. Check if already a member
      const existingMembership = await postgres.queryOne(
        'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [group.id, userId],
        { table: 'group_memberships' }
      );

      if (existingMembership) {
        res.json({
          success: true,
          alreadyMember: true,
          group: group,
          message: 'Du bist bereits Mitglied dieser Gruppe.',
        });
        return;
      }

      // 3. Create membership
      await postgres.exec(
        'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
        [group.id, userId, 'member']
      );

      // Notify existing members
      import('../../../services/notifications/index.js')
        .then(({ notifyGroupMembers }) =>
          notifyGroupMembers({
            groupId: group.id,
            excludeUserId: userId,
            type: 'group_member_joined',
            title: 'Neues Mitglied',
            body: `${req.user?.display_name || 'Jemand'} ist „${group.name}" beigetreten`,
            actionUrl: `/gruppen/${group.id}`,
          })
        )
        .catch(() => {});

      res.json({
        success: true,
        group: group,
        message: `Erfolgreich der Gruppe "${group.name}" beigetreten.`,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/join POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Beitritt zur Gruppe.',
      });
    }
  }
);

// Get group details (info, instructions, knowledge)
router.get(
  '/groups/:groupId/details',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Fetch membership and group info in a single query
      const row = await postgres.queryOne(
        `SELECT
          gm.role, gm.joined_at,
          g.id, g.name, g.description, g.created_at, g.created_by, g.join_token, g.settings, g.avatar_url, g.links
        FROM group_memberships gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      );

      if (!row) {
        res.status(403).json({
          success: false,
          message: 'Du bist nicht Mitglied dieser Gruppe.',
        });
        return;
      }

      const isAdmin = row.role === 'admin' || row.created_by === userId;

      res.json({
        success: true,
        group: {
          id: row.id,
          name: row.name,
          description: row.description,
          created_at: row.created_at,
          created_by: row.created_by,
          join_token: row.join_token,
          settings: row.settings,
          avatar_url: row.avatar_url,
          links: row.links || [],
        },
        membership: {
          role: row.role,
          joined_at: row.joined_at,
          isAdmin,
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/details GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Gruppendetails.',
      });
    }
  }
);

// Update group name and description
router.put(
  '/groups/:groupId/info',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { name, description, settings } = req.body;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Check if user is admin and get group info in one query
      const membershipAndGroup = await postgres.queryOne(
        `SELECT gm.role, g.created_by
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.group_id = $1 AND gm.user_id = $2`,
        [groupId, userId],
        { table: 'group_memberships' }
      );

      if (!membershipAndGroup) {
        res.status(403).json({
          success: false,
          message: 'Du bist nicht Mitglied dieser Gruppe.',
        });
        return;
      }

      const isAdmin =
        membershipAndGroup.role === 'admin' || membershipAndGroup.created_by === userId;

      if (!isAdmin) {
        res.status(403).json({
          success: false,
          message: 'Keine Berechtigung zum Ändern der Gruppendetails.',
        });
        return;
      }

      // Build update object
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        if (!name?.trim()) {
          res.status(400).json({
            success: false,
            message: 'Gruppenname darf nicht leer sein.',
          });
          return;
        }
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name.trim());
      }
      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(description?.trim() || null);
      }
      if (settings !== undefined) {
        if (typeof settings !== 'object' || settings === null) {
          res.status(400).json({
            success: false,
            message: 'Einstellungen müssen ein Objekt sein.',
          });
          return;
        }
        if (settings.templateTags !== undefined) {
          if (!Array.isArray(settings.templateTags)) {
            res.status(400).json({
              success: false,
              message: 'templateTags muss ein Array sein.',
            });
            return;
          }
          if (settings.templateTags.length > 20) {
            res.status(400).json({
              success: false,
              message: 'Maximal 20 Tags erlaubt.',
            });
            return;
          }
          for (const tag of settings.templateTags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              res.status(400).json({
                success: false,
                message: 'Jeder Tag muss ein String mit maximal 50 Zeichen sein.',
              });
              return;
            }
          }
        }
        updateFields.push(`settings = $${paramIndex++}`);
        updateValues.push(JSON.stringify(settings));
      }

      if (updateFields.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Keine Änderungen angegeben.',
        });
        return;
      }

      // Add groupId as the last parameter for WHERE clause
      updateValues.push(groupId);

      // Update group info
      const updateSQL = `UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;
      const result = await postgres.exec(updateSQL, updateValues);

      if (result.changes === 0) {
        throw new Error('Group not found or no changes made');
      }

      res.json({
        success: true,
        message: 'Gruppendetails erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/info PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Gruppendetails.',
      });
    }
  }
);

// Legacy endpoint for backward compatibility
router.put(
  '/groups/:groupId/name',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { name } = req.body;

      if (!name?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Gruppenname ist erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const result = await postgres.exec('UPDATE groups SET name = $1 WHERE id = $2', [
        name.trim(),
        groupId,
      ]);

      if (result.changes === 0) {
        throw new Error('Group not found or no changes made');
      }

      res.json({
        success: true,
        message: 'Gruppenname erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/name PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren des Gruppennamens.',
      });
    }
  }
);

// Get group members
router.get(
  '/groups/:groupId/members',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const members = await postgres.query(
        `
      SELECT
        gm.user_id,
        gm.role,
        gm.joined_at,
        p.first_name,
        p.display_name,
        p.avatar_robot_id
      FROM group_memberships gm
      INNER JOIN profiles p ON p.id = gm.user_id
      WHERE gm.group_id = $1
      ORDER BY gm.joined_at ASC
    `,
        [groupId],
        { table: 'group_memberships' }
      );

      const formattedMembers = (members || []).map((member: any) => ({
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        first_name: member.first_name || null,
        display_name: member.display_name || null,
        avatar_robot_id: member.avatar_robot_id || 1,
      }));

      res.json({
        success: true,
        members: formattedMembers,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/members GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Gruppenmitglieder.',
      });
    }
  }
);

// Update member role
router.put(
  '/groups/:groupId/members/:memberId/role',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string; memberId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId, memberId } = req.params;
      const userId = req.user!.id;
      const { role } = req.body;

      if (!groupId || !memberId) {
        res
          .status(400)
          .json({ success: false, message: 'Gruppen-ID und Mitglieds-ID sind erforderlich.' });
        return;
      }

      if (role !== 'admin' && role !== 'member') {
        res.status(400).json({ success: false, message: 'Rolle muss "admin" oder "member" sein.' });
        return;
      }

      if (String(memberId) === String(userId)) {
        res
          .status(400)
          .json({ success: false, message: 'Du kannst deine eigene Rolle nicht ändern.' });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      // Fetch group info and verify target membership in parallel
      const [group, targetMembership] = await Promise.all([
        postgres.queryOne('SELECT created_by, name FROM groups WHERE id = $1', [groupId], {
          table: 'groups',
        }),
        postgres.queryOne(
          'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
          [groupId, memberId],
          { table: 'group_memberships' }
        ),
      ]);

      if (group && String(group.created_by) === String(memberId)) {
        res.status(400).json({
          success: false,
          message: 'Die Rolle der Gruppenersteller*in kann nicht geändert werden.',
        });
        return;
      }

      if (!targetMembership) {
        res
          .status(404)
          .json({ success: false, message: 'Mitglied nicht in dieser Gruppe gefunden.' });
        return;
      }

      await postgres.exec(
        'UPDATE group_memberships SET role = $1 WHERE group_id = $2 AND user_id = $3',
        [role, groupId, memberId]
      );

      import('../../../services/notifications/index.js')
        .then(({ createNotification }) =>
          createNotification({
            userId: memberId,
            type: 'group_role_changed',
            title: 'Rolle geändert',
            body: `Du bist jetzt ${role === 'admin' ? 'Admin' : 'Mitglied'} in „${group?.name || 'deiner Gruppe'}"`,
            actionUrl: `/gruppen/${groupId}`,
            metadata: { groupId, role },
            groupKey: `group:${groupId}`,
          })
        )
        .catch(() => {});

      res.json({ success: true, message: 'Rolle erfolgreich aktualisiert.' });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/members/:memberId/role PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Rolle.',
      });
    }
  }
);

// ============================================================================
// Group Links Endpoints
// ============================================================================

const ALLOWED_LINK_ICONS = new Set([
  'globe',
  'link',
  'mail',
  'calendar',
  'chat',
  'folder',
  'phone',
  'video',
  'document',
  'map',
  'signal',
  'whatsapp',
  'telegram',
  'discord',
  'slack',
  'mattermost',
  'canva',
  'figma',
  'miro',
  'drive',
  'nextcloud',
  'notion',
  'trello',
  'github',
  'zoom',
  'googlemeet',
  'youtube',
  'instagram',
  'mastodon',
  'linkedin',
  'x',
]);
const MAX_LINKS = 20;

function validateGroupLink(link: any): string | null {
  if (!link || typeof link !== 'object') return 'Link muss ein Objekt sein.';
  if (typeof link.title !== 'string' || link.title.trim().length === 0 || link.title.length > 100) {
    return 'Titel ist erforderlich (max. 100 Zeichen).';
  }
  if (typeof link.url !== 'string' || !/^https?:\/\/.+/.test(link.url)) {
    return 'URL muss mit http:// oder https:// beginnen.';
  }
  if (
    link.description != null &&
    (typeof link.description !== 'string' || link.description.length > 300)
  ) {
    return 'Beschreibung darf max. 300 Zeichen haben.';
  }
  if (typeof link.icon !== 'string' || !ALLOWED_LINK_ICONS.has(link.icon)) {
    return `Ungültiges Icon. Erlaubt: ${[...ALLOWED_LINK_ICONS].join(', ')}`;
  }
  return null;
}

router.post(
  '/groups/:groupId/links',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const error = validateGroupLink(req.body);
      if (error) {
        res.status(400).json({ success: false, message: error });
        return;
      }

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: any[] | null } | null;

      const links = group?.links || [];
      if (links.length >= MAX_LINKS) {
        res.status(400).json({ success: false, message: `Maximal ${MAX_LINKS} Links pro Gruppe.` });
        return;
      }

      const newLink = {
        id: crypto.randomUUID(),
        title: req.body.title.trim(),
        url: req.body.url.trim(),
        icon: req.body.icon,
        ...(req.body.description?.trim() && { description: req.body.description.trim() }),
      };

      links.push(newLink);

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      res.json({ success: true, link: newLink });
    } catch (err: any) {
      log.error('[Group Links POST] Error:', err);
      if (err.message.includes('Mitglied') || err.message.includes('Admin')) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Fehler beim Hinzufügen des Links.' });
    }
  }
);

router.put(
  '/groups/:groupId/links/:linkId',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string; linkId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId, linkId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const error = validateGroupLink(req.body);
      if (error) {
        res.status(400).json({ success: false, message: error });
        return;
      }

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: any[] | null } | null;

      const links = group?.links || [];
      const idx = links.findIndex((l: any) => l.id === linkId);
      if (idx === -1) {
        res.status(404).json({ success: false, message: 'Link nicht gefunden.' });
        return;
      }

      links[idx] = {
        ...links[idx],
        title: req.body.title.trim(),
        url: req.body.url.trim(),
        icon: req.body.icon,
        ...(req.body.description?.trim() ? { description: req.body.description.trim() } : {}),
      };
      if (!req.body.description?.trim()) delete links[idx].description;

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      res.json({ success: true, link: links[idx] });
    } catch (err: any) {
      log.error('[Group Links PUT] Error:', err);
      if (err.message.includes('Mitglied') || err.message.includes('Admin')) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren des Links.' });
    }
  }
);

router.delete(
  '/groups/:groupId/links/:linkId',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string; linkId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId, linkId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      const group = (await postgres.queryOne('SELECT links FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      })) as { links: any[] | null } | null;

      const links = (group?.links || []).filter((l: any) => l.id !== linkId);

      await postgres.exec(
        'UPDATE groups SET links = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(links), groupId]
      );

      res.json({ success: true });
    } catch (err: any) {
      log.error('[Group Links DELETE] Error:', err);
      if (err.message.includes('Mitglied') || err.message.includes('Admin')) {
        res.status(403).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Fehler beim Löschen des Links.' });
    }
  }
);

export default router;
