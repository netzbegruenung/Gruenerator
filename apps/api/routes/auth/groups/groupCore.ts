/**
 * Group core management routes
 * Handles group CRUD, join/leave, and membership operations
 */

import express, { Router, Response, NextFunction } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest } from '../types.js';

const log = createLogger('userGroups');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

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

  const membership = await postgres.queryOne(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
    { table: 'group_memberships' }
  ) as { role: string } | null;

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

// Add debugging middleware to all groups routes
router.use((_req: AuthRequest, _res: Response, next: NextFunction) => {
  next();
});

// ============================================================================
// Groups Management Endpoints
// ============================================================================

// Get user groups
router.get('/groups', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
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
        groups: []
      });
      return;
    }

    const groupIds = memberships.map((m: any) => m.group_id);

    // Get group details
    const groupsData = await postgres.query(
      'SELECT id, name, description, created_at, created_by, join_token FROM groups WHERE id = ANY($1)',
      [groupIds],
      { table: 'groups' }
    );

    // Combine group and membership data
    const combinedGroups = (groupsData || []).map((group: any) => ({
      ...group,
      role: memberships.find((m: any) => m.group_id === group.id)?.role || 'member',
      joined_at: memberships.find((m: any) => m.group_id === group.id)?.joined_at,
      isAdmin: group.created_by === userId ||
               memberships.find((m: any) => m.group_id === group.id)?.role === 'admin'
    }));

    res.json({
      success: true,
      groups: combinedGroups
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Gruppen.'
    });
  }
});

// Create a new group
router.post('/groups', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Gruppenname ist erforderlich.'
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

      // 3. Create empty instructions entry
      await postgres.transactionExec(
        client,
        'INSERT INTO group_instructions (group_id) VALUES ($1)',
        [group.id]
      );

      return group;
    });

    res.json({
      success: true,
      group: {
        ...newGroup,
        role: 'admin',
        isAdmin: true,
        joined_at: new Date().toISOString()
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Erstellen der Gruppe.'
    });
  }
});

// Delete a group
router.delete('/groups/:groupId', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    if (!groupId) {
      res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
      return;
    }

    // Check if user is authorized to delete the group (creator or admin)
    const groupData = await postgres.queryOne(
      'SELECT created_by FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!groupData) {
      res.status(404).json({
        success: false,
        message: 'Gruppe nicht gefunden.'
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
          message: 'Keine Berechtigung zum Löschen dieser Gruppe.'
        });
        return;
      }
    }

    // Delete in correct order using transaction to ensure data integrity
    await postgres.transaction(async (client: any) => {
      // 1. Delete group knowledge entries
      await postgres.transactionExec(client, 'DELETE FROM group_knowledge WHERE group_id = $1', [groupId]);

      // 2. Delete group instructions
      await postgres.transactionExec(client, 'DELETE FROM group_instructions WHERE group_id = $1', [groupId]);

      // 3. Delete group content shares
      await postgres.transactionExec(client, 'DELETE FROM group_content_shares WHERE group_id = $1', [groupId]);

      // 4. Delete group memberships
      await postgres.transactionExec(client, 'DELETE FROM group_memberships WHERE group_id = $1', [groupId]);

      // 5. Delete the group itself
      const result = await postgres.transactionExec(client, 'DELETE FROM groups WHERE id = $1', [groupId]);

      if (result.changes === 0) {
        throw new Error('Group not found or already deleted');
      }
    });

    res.json({
      success: true,
      message: 'Gruppe erfolgreich gelöscht.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Löschen der Gruppe.'
    });
  }
});

// Verify join token (for JoinGroupPage)
router.get('/groups/verify-token/:joinToken', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { joinToken } = req.params;
    const userId = req.user!.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    if (!joinToken?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
      return;
    }

    // 1. Get the group from the token
    const group = await postgres.queryOne(
      'SELECT id, name FROM groups WHERE join_token = $1',
      [joinToken.trim()],
      { table: 'groups' }
    );

    if (!group) {
      res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
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
      alreadyMember: !!existingMembership
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/verify-token GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Überprüfen des Einladungslinks.'
    });
  }
});

// Join a group with token
router.post('/groups/join', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { joinToken } = req.body;
    const userId = req.user!.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    if (!joinToken?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
      return;
    }

    // 1. Get the group from the token
    const group = await postgres.queryOne(
      'SELECT id, name FROM groups WHERE join_token = $1',
      [joinToken.trim()],
      { table: 'groups' }
    );

    if (!group) {
      res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
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
        message: 'Du bist bereits Mitglied dieser Gruppe.'
      });
      return;
    }

    // 3. Create membership
    await postgres.exec(
      'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
      [group.id, userId, 'member']
    );

    res.json({
      success: true,
      group: group,
      message: `Erfolgreich der Gruppe "${group.name}" beigetreten.`
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/join POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Beitritt zur Gruppe.'
    });
  }
});

// Get group details (info, instructions, knowledge)
router.get('/groups/:groupId/details', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    if (!groupId) {
      res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
      return;
    }

    // 1. Check membership and role
    const membership = await postgres.queryOne(
      'SELECT role, joined_at FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
      { table: 'group_memberships' }
    );

    if (!membership) {
      res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
      return;
    }

    // 2. Fetch group info
    const group = await postgres.queryOne(
      'SELECT id, name, description, created_at, created_by, join_token FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!group) {
      throw new Error('Group not found');
    }

    // 3. Fetch instructions
    const instructions = await postgres.queryOne(
      'SELECT group_id, custom_antrag_prompt, custom_social_prompt, custom_universal_prompt, custom_rede_prompt, custom_buergeranfragen_prompt, custom_gruenejugend_prompt, antrag_instructions_enabled, social_instructions_enabled FROM group_instructions WHERE group_id = $1',
      [groupId],
      { table: 'group_instructions' }
    );

    // 4. Fetch knowledge
    const knowledge = await postgres.query(
      'SELECT id, title, content, created_by, created_at, updated_at FROM group_knowledge WHERE group_id = $1 ORDER BY created_at ASC',
      [groupId],
      { table: 'group_knowledge' }
    );

    // Determine if user is admin
    const isAdmin = membership.role === 'admin' || group.created_by === userId;

    res.json({
      success: true,
      group: group,
      instructions: instructions || {
        group_id: groupId,
        custom_antrag_prompt: '',
        custom_social_prompt: '',
        custom_universal_prompt: '',
        custom_rede_prompt: '',
        custom_buergeranfragen_prompt: '',
        custom_gruenejugend_prompt: '',
        antrag_instructions_enabled: false,
        social_instructions_enabled: false
      },
      knowledge: knowledge || [],
      membership: {
        role: membership.role,
        joined_at: membership.joined_at,
        isAdmin: isAdmin
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/details GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Gruppendetails.'
    });
  }
});

// Update group name and description
router.put('/groups/:groupId/info', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { name, description } = req.body;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    if (!groupId) {
      res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
      return;
    }

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
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
      return;
    }

    const isAdmin = membershipAndGroup.role === 'admin' || membershipAndGroup.created_by === userId;

    if (!isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern der Gruppendetails.'
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
          message: 'Gruppenname darf nicht leer sein.'
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

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Keine Änderungen angegeben.'
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
      message: 'Gruppendetails erfolgreich aktualisiert.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/info PUT] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Aktualisieren der Gruppendetails.'
    });
  }
});

// Legacy endpoint for backward compatibility
router.put('/groups/:groupId/name', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { name } = req.body;

    if (!groupId) {
      res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Gruppenname ist erforderlich.'
      });
      return;
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    // Update group name
    const result = await postgres.exec(
      'UPDATE groups SET name = $1 WHERE id = $2',
      [name.trim(), groupId]
    );

    if (result.changes === 0) {
      throw new Error('Group not found or no changes made');
    }

    res.json({
      success: true,
      message: 'Gruppenname erfolgreich aktualisiert.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/name PUT] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Aktualisieren des Gruppennamens.'
    });
  }
});

// Get group members
router.get('/groups/:groupId/members', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    if (!groupId) {
      res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
      return;
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Get all group members with their profile information
    const members = await postgres.query(`
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
    `, [groupId], { table: 'group_memberships' });

    // Format member data
    const formattedMembers = (members || []).map((member: any) => ({
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      first_name: member.first_name || null,
      display_name: member.display_name || null,
      avatar_robot_id: member.avatar_robot_id || 1
    }));

    res.json({
      success: true,
      members: formattedMembers
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/members GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Gruppenmitglieder.'
    });
  }
});

export default router;
