
import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('userGroups');


const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Helper function to get PostgreSQL instance and check user membership
async function getPostgresAndCheckMembership(groupId, userId, requireAdmin = false) {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();
  
  const membership = await postgres.queryOne(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
    { table: 'group_memberships' }
  );
  
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
router.use((req, res, next) => {
  next();
});

// === GROUPS MANAGEMENT ENDPOINTS ===

// Get user groups
router.get('/groups', ensureAuthenticated, async (req, res) => {
  try {
    
    const userId = req.user.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    // Get user's group memberships
    const memberships = await postgres.query(
      'SELECT group_id, role, joined_at FROM group_memberships WHERE user_id = $1',
      [userId],
      { table: 'group_memberships' }
    );

    if (!memberships || memberships.length === 0) {
      return res.json({
        success: true,
        groups: []
      });
    }

    const groupIds = memberships.map(m => m.group_id);
    
    // Get group details
    const groupsData = await postgres.query(
      'SELECT id, name, description, created_at, created_by, join_token FROM groups WHERE id = ANY($1)',
      [groupIds],
      { table: 'groups' }
    );

    // Combine group and membership data
    const combinedGroups = groupsData.map(group => ({
      ...group,
      role: memberships.find(m => m.group_id === group.id)?.role || 'member',
      joined_at: memberships.find(m => m.group_id === group.id)?.joined_at,
      isAdmin: group.created_by === userId || 
               memberships.find(m => m.group_id === group.id)?.role === 'admin'
    }));

    res.json({
      success: true,
      groups: combinedGroups
    });
    
  } catch (error) {
    log.error('[User Groups /groups GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppen.'
    });
  }
});

// Create a new group
router.post('/groups', ensureAuthenticated, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Gruppenname ist erforderlich.'
      });
    }

    const userId = req.user.id;
    const joinToken = crypto.randomBytes(16).toString('hex');
    const groupId = uuidv4();
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Create group, membership and instructions in a transaction
    const newGroup = await postgres.transaction(async (client) => {
      // 1. Create the group
      const group = await postgres.transactionQueryOne(
        client,
        `INSERT INTO groups (id, name, created_by, join_token, description) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, name, description, created_at, created_by, join_token`,
        [groupId, name.trim(), userId, joinToken, null],
        { table: 'groups' }
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
    log.error('[User Groups /groups POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Erstellen der Gruppe.'
    });
  }
});

// Delete a group
router.delete('/groups/:groupId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // Check if user is authorized to delete the group (creator or admin)
    const groupData = await postgres.queryOne(
      'SELECT created_by FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!groupData) {
      return res.status(404).json({
        success: false,
        message: 'Gruppe nicht gefunden.'
      });
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
        return res.status(403).json({
          success: false,
          message: 'Keine Berechtigung zum Löschen dieser Gruppe.'
        });
      }
    }

    // Delete in correct order using transaction to ensure data integrity
    await postgres.transaction(async (client) => {
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
    log.error('[User Groups /groups DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen der Gruppe.'
    });
  }
});

// Verify join token (for JoinGroupPage)
router.get('/groups/verify-token/:joinToken', ensureAuthenticated, async (req, res) => {
  try {
    const { joinToken } = req.params;
    const userId = req.user.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    if (!joinToken?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
    }

    // 1. Get the group from the token
    const group = await postgres.queryOne(
      'SELECT id, name FROM groups WHERE join_token = $1',
      [joinToken.trim()],
      { table: 'groups' }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
      });
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
    log.error('[User Groups /groups/verify-token GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Überprüfen des Einladungslinks.'
    });
  }
});

// Join a group with token
router.post('/groups/join', ensureAuthenticated, async (req, res) => {
  try {
    const { joinToken } = req.body;
    const userId = req.user.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    if (!joinToken?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
    }

    // 1. Get the group from the token
    const group = await postgres.queryOne(
      'SELECT id, name FROM groups WHERE join_token = $1',
      [joinToken.trim()],
      { table: 'groups' }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
      });
    }

    // 2. Check if already a member
    const existingMembership = await postgres.queryOne(
      'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [group.id, userId],
      { table: 'group_memberships' }
    );

    if (existingMembership) {
      return res.json({
        success: true,
        alreadyMember: true,
        group: group,
        message: 'Du bist bereits Mitglied dieser Gruppe.'
      });
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
    log.error('[User Groups /groups/join POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Beitritt zur Gruppe.'
    });
  }
});

// Get group details (info, instructions, knowledge)
router.get('/groups/:groupId/details', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // 1. Check membership and role
    const membership = await postgres.queryOne(
      'SELECT role, joined_at FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
      { table: 'group_memberships' }
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
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
    log.error('[User Groups /groups/:groupId/details GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppendetails.'
    });
  }
});

// Update group name and description
router.put('/groups/:groupId/info', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name, description } = req.body;
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
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
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    const isAdmin = membershipAndGroup.role === 'admin' || membershipAndGroup.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern der Gruppendetails.'
      });
    }

    // Build update object
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Gruppenname darf nicht leer sein.'
        });
      }
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name.trim());
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description?.trim() || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Keine Änderungen angegeben.'
      });
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
    log.error('[User Groups /groups/:groupId/info PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Gruppendetails.'
    });
  }
});

// Legacy endpoint for backward compatibility
router.put('/groups/:groupId/name', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Gruppenname ist erforderlich.'
      });
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
    log.error('[User Groups /groups/:groupId/name PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren des Gruppennamens.'
    });
  }
});

// Get group instructions
router.get('/groups/:groupId/instructions', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Fetch instructions
    const instructions = await postgres.queryOne(
      'SELECT group_id, custom_antrag_prompt, custom_social_prompt, custom_universal_prompt, custom_rede_prompt, custom_buergeranfragen_prompt, custom_gruenejugend_prompt, antrag_instructions_enabled, social_instructions_enabled FROM group_instructions WHERE group_id = $1',
      [groupId],
      { table: 'group_instructions' }
    );


    res.json({
      success: true,
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
      }
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/instructions GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppenanweisungen.'
    });
  }
});

// Update group instructions
router.put('/groups/:groupId/instructions', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const {
      custom_antrag_prompt,
      custom_social_prompt,
      custom_universal_prompt,
      custom_rede_prompt,
      custom_buergeranfragen_prompt,
      custom_gruenejugend_prompt,
      antrag_instructions_enabled,
      social_instructions_enabled
    } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, true);

    // Build update object
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (custom_antrag_prompt !== undefined) {
      updateFields.push(`custom_antrag_prompt = $${paramIndex++}`);
      updateValues.push(custom_antrag_prompt);
    }
    if (custom_social_prompt !== undefined) {
      updateFields.push(`custom_social_prompt = $${paramIndex++}`);
      updateValues.push(custom_social_prompt);
    }
    if (custom_universal_prompt !== undefined) {
      updateFields.push(`custom_universal_prompt = $${paramIndex++}`);
      updateValues.push(custom_universal_prompt);
    }
    if (custom_rede_prompt !== undefined) {
      updateFields.push(`custom_rede_prompt = $${paramIndex++}`);
      updateValues.push(custom_rede_prompt);
    }
    if (custom_buergeranfragen_prompt !== undefined) {
      updateFields.push(`custom_buergeranfragen_prompt = $${paramIndex++}`);
      updateValues.push(custom_buergeranfragen_prompt);
    }
    if (custom_gruenejugend_prompt !== undefined) {
      updateFields.push(`custom_gruenejugend_prompt = $${paramIndex++}`);
      updateValues.push(custom_gruenejugend_prompt);
    }
    if (antrag_instructions_enabled !== undefined) {
      updateFields.push(`antrag_instructions_enabled = $${paramIndex++}`);
      updateValues.push(antrag_instructions_enabled);
    }
    if (social_instructions_enabled !== undefined) {
      updateFields.push(`social_instructions_enabled = $${paramIndex++}`);
      updateValues.push(social_instructions_enabled);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Keine Änderungen angegeben.'
      });
    }

    // Add groupId as the last parameter for WHERE clause
    updateValues.push(groupId);

    // Update instructions using UPSERT
    const upsertSQL = `
      INSERT INTO group_instructions (group_id, ${updateFields.map((f, i) => f.split(' = ')[0]).join(', ')})
      VALUES ($${paramIndex}, ${updateFields.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (group_id) 
      DO UPDATE SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    `;
    
    const result = await postgres.exec(upsertSQL, updateValues);


    res.json({
      success: true,
      message: 'Gruppenanweisungen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/instructions PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Gruppenanweisungen.'
    });
  }
});

// Add knowledge entry
router.post('/groups/:groupId/knowledge', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { title, content } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    if (!content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Inhalt ist erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    // Insert knowledge entry
    const newKnowledge = await postgres.queryOne(
      `INSERT INTO group_knowledge (group_id, title, content, created_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, title, content, created_by, created_at, updated_at`,
      [groupId, title?.trim() || 'Untitled', content.trim(), userId],
      { table: 'group_knowledge' }
    );

    if (!newKnowledge) {
      throw new Error('Failed to create knowledge entry');
    }


    res.json({
      success: true,
      knowledge: newKnowledge,
      message: 'Gruppenwissen erfolgreich hinzugefügt.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/knowledge POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Hinzufügen des Gruppenwissens.'
    });
  }
});

// Get individual knowledge entry
router.get('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Fetch the specific knowledge entry
    const knowledge = await postgres.queryOne(
      'SELECT id, title, content, created_by, created_at, updated_at FROM group_knowledge WHERE id = $1 AND group_id = $2',
      [knowledgeId, groupId],
      { table: 'group_knowledge' }
    );

    if (!knowledge) {
      return res.status(404).json({
        success: false,
        message: 'Wissenseintrag nicht gefunden.'
      });
    }


    res.json({
      success: true,
      knowledge: knowledge
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden des Wissenseintrags.'
    });
  }
});

// Update knowledge entry
router.put('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    const { title, content } = req.body;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    // Build update object
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      updateValues.push(title?.trim() || 'Untitled');
    }
    if (content !== undefined) {
      updateFields.push(`content = $${paramIndex++}`);
      updateValues.push(content?.trim() || '');
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Keine Änderungen angegeben.'
      });
    }

    // Add updated_at
    updateFields.push(`updated_at = $${paramIndex++}`);
    updateValues.push(new Date().toISOString());

    // Add IDs for WHERE clause
    updateValues.push(knowledgeId);
    updateValues.push(groupId);

    // Update knowledge entry
    const updateSQL = `UPDATE group_knowledge SET ${updateFields.join(', ')} WHERE id = $${paramIndex++} AND group_id = $${paramIndex} RETURNING id, title, content, created_by, created_at, updated_at`;
    const updatedKnowledge = await postgres.queryOne(updateSQL, updateValues, { table: 'group_knowledge' });

    if (!updatedKnowledge) {
      throw new Error('Knowledge entry not found or no changes made');
    }


    res.json({
      success: true,
      knowledge: updatedKnowledge,
      message: 'Gruppenwissen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren des Gruppenwissens.'
    });
  }
});

// Delete knowledge entry
router.delete('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    // Delete knowledge entry
    const result = await postgres.exec(
      'DELETE FROM group_knowledge WHERE id = $1 AND group_id = $2',
      [knowledgeId, groupId]
    );

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Wissenseintrag nicht gefunden.'
      });
    }


    res.json({
      success: true,
      message: 'Gruppenwissen erfolgreich gelöscht.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen des Gruppenwissens.'
    });
  }
});

// Get group members
router.get('/groups/:groupId/members', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
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
    const formattedMembers = members.map(member => ({
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
    log.error('[User Groups /groups/:groupId/members GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppenmitglieder.'
    });
  }
});

// === GROUP SHARING ENDPOINTS ===

// Share content to a group
router.post('/groups/:groupId/share', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { contentType, contentId, permissions } = req.body;

    if (!groupId || !contentType || !contentId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.'
      });
    }

    // Validate content type
    const validContentTypes = ['documents', 'custom_generators', 'notebook_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Verify user owns the content

    // Map content type to actual table name
    const tableNameMap = {
      'database': 'user_templates',
      'template': 'user_templates',
      'user_templates': 'user_templates',
      'instructions': 'user_instructions',
      'user_instructions': 'user_instructions'
    };
    const tableName = tableNameMap[contentType] || contentType;

    // Build ownership query based on content type
    let ownershipSQL = `SELECT user_id FROM ${tableName} WHERE id = $1`;
    let ownershipParams = [contentId];

    // For user_templates table (templates), also filter by type = 'template'
    if (tableName === 'user_templates') {
      ownershipSQL += ` AND type = $2`;
      ownershipParams.push('template');
    }

    const contentOwnership = await postgres.queryOne(
      ownershipSQL,
      ownershipParams,
      { table: tableName }
    );

    if (!contentOwnership) {
      log.error('[User Groups /groups/:groupId/share POST] Content ownership verification failed:', {
        contentType,
        contentId,
        userId
      });
      return res.status(404).json({
        success: false,
        message: 'Inhalt nicht gefunden.'
      });
    }

    if (contentOwnership.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht der Besitzer dieses Inhalts.'
      });
    }

    // Check if content is already shared with this group via junction table
    const existingShare = await postgres.queryOne(
      'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId],
      { table: 'group_content_shares' }
    );

    if (existingShare) {
      return res.status(400).json({
        success: false,
        message: 'Inhalt ist bereits mit dieser Gruppe geteilt.'
      });
    }

    // Set default permissions if not provided
    const sharePermissions = permissions || {
      read: true,
      write: false,
      collaborative: false
    };

    // Share content using junction table
    log.debug('[User Groups /share] Inserting share record:', {
      contentType,
      contentId,
      groupId,
      userId,
      permissions: sharePermissions
    });

    await postgres.exec(
      'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions) VALUES ($1, $2, $3, $4, $5)',
      [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions)]
    );

    log.debug('[User Groups /share] Share record inserted successfully');

    res.json({
      success: true,
      message: 'Inhalt erfolgreich mit der Gruppe geteilt.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/share POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Teilen des Inhalts.'
    });
  }
});

// Unshare content from a group
router.delete('/groups/:groupId/share', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { contentType, contentId } = req.body;

    if (!groupId || !contentType || !contentId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Verify the share exists and user owns it or has permission to unshare
    const shareRecord = await postgres.queryOne(
      'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId],
      { table: 'group_content_shares' }
    );

    if (!shareRecord) {
      return res.status(404).json({
        success: false,
        message: 'Geteilter Inhalt nicht gefunden.'
      });
    }

    // Only the user who shared the content can unshare it (or group admins in future)
    if (shareRecord.shared_by_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Du kannst nur Inhalte aufheben, die du selbst geteilt hast.'
      });
    }

    // Remove from junction table
    const result = await postgres.exec(
      'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId]
    );

    if (result.changes === 0) {
      throw new Error('Share record not found or already deleted');
    }


    res.json({
      success: true,
      message: 'Inhalt wurde erfolgreich aus der Gruppe entfernt.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/share DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des Inhalts aus der Gruppe.'
    });
  }
});

// Get all content shared with a group
router.get('/groups/:groupId/content', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Fetch group knowledge entries
    const groupKnowledge = await postgres.query(
      'SELECT id, title, content, created_by, created_at, updated_at FROM group_knowledge WHERE group_id = $1 ORDER BY created_at ASC',
      [groupId],
      { table: 'group_knowledge' }
    ) || [];

    // Fetch shared content with user profile information
    const sharedContent = await postgres.query(`
      SELECT
        gcs.content_type,
        gcs.content_id,
        gcs.shared_at,
        gcs.permissions,
        gcs.shared_by_user_id,
        p.first_name,
        p.display_name
      FROM group_content_shares gcs
      LEFT JOIN profiles p ON p.id = gcs.shared_by_user_id
      WHERE gcs.group_id = $1
      ORDER BY gcs.shared_at DESC
    `, [groupId], { table: 'group_content_shares' }) || [];

    log.debug('[User Groups /content] Fetched shared content:', {
      groupId,
      totalShares: sharedContent.length,
      contentTypes: sharedContent.map(s => s.content_type)
    });

    // Group shared content by type for easier processing
    const contentByType = {
      documents: [],
      custom_generators: [],
      notebook_collections: [],
      user_documents: [],
      database: []
    };

    sharedContent.forEach(share => {
      if (contentByType[share.content_type]) {
        contentByType[share.content_type].push(share);
      }
    });

    // Fetch actual content details for each type using SQL queries
    const contentResults = [];

    // Documents
    if (contentByType.documents.length > 0) {
      const documentIds = contentByType.documents.map(s => s.content_id);
      const documentsData = await postgres.query(
        `SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1)`,
        [documentIds],
        { table: 'documents' }
      ) || [];
      contentResults.push({ type: 'documents', result: { data: documentsData }, shares: contentByType.documents });
    }

    // Custom Generators
    if (contentByType.custom_generators.length > 0) {
      const generatorIds = contentByType.custom_generators.map(s => s.content_id);
      const generatorsData = await postgres.query(
        `SELECT id, name, title, description, created_at, updated_at, user_id FROM custom_generators WHERE id = ANY($1)`,
        [generatorIds],
        { table: 'custom_generators' }
      ) || [];
      contentResults.push({ type: 'custom_generators', result: { data: generatorsData }, shares: contentByType.custom_generators });
    }

    // Notebook Collections
    if (contentByType.notebook_collections.length > 0) {
      const notebookIds = contentByType.notebook_collections.map(s => s.content_id);
      const notebooksData = await postgres.query(
        `SELECT id, name, description, view_count, created_at, updated_at, user_id FROM notebook_collections WHERE id = ANY($1)`,
        [notebookIds],
        { table: 'notebook_collections' }
      ) || [];
      contentResults.push({ type: 'notebook_collections', result: { data: notebooksData }, shares: contentByType.notebook_collections });
    }

    // User Documents (Texts)
    if (contentByType.user_documents.length > 0) {
      const textIds = contentByType.user_documents.map(s => s.content_id);
      const rawTextsData = await postgres.query(
        `SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1)`,
        [textIds],
        { table: 'user_documents' }
      ) || [];
      
      // Transform data to include computed word_count and character_count like /saved-texts endpoint
      const textsData = rawTextsData.map(item => {
        const plainText = (item.content || '').replace(/<[^>]*>/g, '').trim();
        const wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;
        const characterCount = plainText.length;
        
        return {
          ...item,
          word_count: wordCount,
          character_count: characterCount
        };
      });
      
      contentResults.push({ type: 'user_documents', result: { data: textsData }, shares: contentByType.user_documents });
    }

    // Templates (User Content)
    if (contentByType.database.length > 0) {
      const templateIds = contentByType.database.map(s => s.content_id);
      log.debug('[User Groups /content] Fetching templates:', { templateIds });

      const templatesData = await postgres.query(
        `SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template'`,
        [templateIds],
        { table: 'user_templates' }
      ) || [];

      log.debug('[User Groups /content] Templates fetched:', {
        requestedCount: templateIds.length,
        foundCount: templatesData.length,
        foundIds: templatesData.map(t => t.id)
      });

      contentResults.push({ type: 'database', result: { data: templatesData }, shares: contentByType.database });
    } else {
      log.debug('[User Groups /content] No database/template shares found in group_content_shares');
    }

    // Process and format results
    const groupContent = {
      knowledge: groupKnowledge,
      documents: [],
      generators: [],
      notebooks: [],
      texts: [],
      templates: []
    };

    contentResults.forEach(({ type, result, shares }) => {
      const items = (result.data || []).map(item => {
        // Find the corresponding share info
        const shareInfo = shares.find(s => s.content_id === item.id);
        
        return {
          ...item,
          contentType: type,
          shared_at: shareInfo?.shared_at,
          group_permissions: typeof shareInfo?.permissions === 'string' ? JSON.parse(shareInfo.permissions) : shareInfo?.permissions,
          shared_by_name: shareInfo?.display_name || shareInfo?.first_name || 'Unknown User',
          // Add template-specific fields for database
          ...(type === 'database' && {
            template_type: (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.template_type || 'canva',
            canva_url: item.external_url
          })
        };
      });

      // Map to the correct groupContent key
      const keyMap = {
        documents: 'documents',
        custom_generators: 'generators',
        notebook_collections: 'notebooks',
        user_documents: 'texts',
        database: 'templates'
      };

      groupContent[keyMap[type]] = items;
    });

    log.debug('[User Groups /content] Final response:', {
      templatesCount: groupContent.templates.length,
      documentsCount: groupContent.documents.length,
      textsCount: groupContent.texts.length
    });

    res.json({
      success: true,
      content: groupContent
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/content GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppeninhalte.'
    });
  }
});

// Update content permissions
router.put('/groups/:groupId/content/:contentId/permissions', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId, contentId } = req.params;
    const userId = req.user.id;
    const { contentType, permissions } = req.body;
    
    if (!groupId || !contentId || !contentType || !permissions) {
      return res.status(400).json({
        success: false,
        message: 'Alle Parameter sind erforderlich.'
      });
    }

    // Validate content type
    const validContentTypes = ['documents', 'custom_generators', 'notebook_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
      });
    }

    const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Check if content is shared with the group and get share info
    const shareRecord = await postgres.queryOne(
      'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId],
      { table: 'group_content_shares' }
    );

    if (!shareRecord) {
      return res.status(404).json({
        success: false,
        message: 'Inhalt ist nicht mit dieser Gruppe geteilt.'
      });
    }

    // Check if user has permission to modify permissions (admin or content sharer)
    const isAdmin = membership.role === 'admin';
    const isSharer = shareRecord.shared_by_user_id === userId;

    if (!isAdmin && !isSharer) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern der Berechtigungen.'
      });
    }

    // Update permissions in the junction table
    const result = await postgres.exec(
      'UPDATE group_content_shares SET permissions = $1 WHERE content_type = $2 AND content_id = $3 AND group_id = $4',
      [JSON.stringify(permissions), contentType, contentId, groupId]
    );

    if (result.changes === 0) {
      throw new Error('Share record not found or no changes made');
    }


    res.json({
      success: true,
      message: 'Berechtigungen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Berechtigungen.'
    });
  }
});

// Remove content from group (unshare)
router.delete('/groups/:groupId/content/:contentId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId, contentId } = req.params;
    const userId = req.user.id;
    const { contentType } = req.body;

    if (!groupId || !contentId || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-ID und Content-Type sind erforderlich.'
      });
    }

    // Validate content type - include database for templates
    const validContentTypes = ['documents', 'custom_generators', 'notebook_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
      });
    }

    const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Check if user is admin
    const isAdmin = membership.role === 'admin';
    
    // For now, only admins can unshare content (can be extended later)
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Nur Gruppenadministratoren können geteilte Inhalte entfernen.'
      });
    }

    // Verify the share exists in the junction table
    const shareRecord = await postgres.queryOne(
      'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId],
      { table: 'group_content_shares' }
    );

    if (!shareRecord) {
      log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Share check error');
      return res.status(404).json({
        success: false,
        message: 'Geteilter Inhalt nicht gefunden.'
      });
    }

    // Remove from junction table
    const result = await postgres.exec(
      'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [contentType, contentId, groupId]
    );

    if (result.changes === 0) {
      log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Unshare error');
      throw new Error('Share record not found or already deleted');
    }


    res.json({
      success: true,
      message: 'Inhalt erfolgreich aus der Gruppe entfernt.'
    });
    
  } catch (error) {
    log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des geteilten Inhalts.'
    });
  }
});

// =============================================================================
// GROUP WOLKE ENDPOINTS
// =============================================================================

/**
 * Get group's Wolke share links
 * GET /groups/:groupId/wolke/share-links
 */
router.get('/:groupId/wolke/share-links', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;


    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Get group's Wolke share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Gruppe nicht gefunden.'
      });
    }

    const shareLinks = group.wolke_share_links || [];


    res.json({
      success: true,
      shareLinks: shareLinks
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/share-links GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Abrufen der Wolke-Links.'
    });
  }
});

/**
 * Add new Wolke share link to group
 * POST /groups/:groupId/wolke/share-links
 */
router.post('/:groupId/wolke/share-links', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { shareLink, label, baseUrl, shareToken } = req.body;


    // Check if user is admin of the group (only admins can add Wolke links)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareLink) {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ist erforderlich.'
      });
    }

    // Validate share link format (reuse existing validation logic)
    const urlObj = new URL(shareLink);
    const sharePattern = /\/s\/[A-Za-z0-9]+/;
    if (!sharePattern.test(urlObj.pathname)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiges Nextcloud Share-Link Format.'
      });
    }

    // Extract share token
    const tokenMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
    const finalShareToken = shareToken || (tokenMatch ? tokenMatch[1] : null);
    const finalBaseUrl = baseUrl || `${urlObj.protocol}//${urlObj.host}`;

    // Get current share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const currentLinks = group?.wolke_share_links || [];

    // Check if share link already exists
    const existingLink = currentLinks.find(link => link.share_link === shareLink);
    if (existingLink) {
      return res.status(409).json({
        success: false,
        message: 'Dieser Share-Link ist bereits in der Gruppe vorhanden.'
      });
    }

    // Create new link object
    const newLink = {
      id: Date.now().toString(), // Simple ID based on timestamp
      share_link: shareLink,
      label: label || null,
      base_url: finalBaseUrl,
      share_token: finalShareToken,
      is_active: true,
      added_by_user_id: userId,
      created_at: new Date().toISOString()
    };

    // Add to existing links
    const updatedLinks = [...currentLinks, newLink];

    // Update the group with new links
    const result = await postgres.update(
      'groups',
      { wolke_share_links: updatedLinks },
      { id: groupId }
    );

    if (!result || result.length === 0) {
      throw new Error('Fehler beim Speichern des Share-Links');
    }


    res.status(201).json({
      success: true,
      shareLink: newLink,
      message: 'Wolke-Link erfolgreich zur Gruppe hinzugefügt.'
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/share-links POST] Error:', error);
    
    if (error.message.includes('Keine Berechtigung')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Hinzufügen des Wolke-Links.'
    });
  }
});

/**
 * Delete Wolke share link from group
 * DELETE /groups/:groupId/wolke/share-links/:shareId
 */
router.delete('/:groupId/wolke/share-links/:shareId', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const shareId = req.params.shareId;
    const userId = req.user.id;


    // Check if user is admin of the group (only admins can delete Wolke links)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareId) {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ID ist erforderlich.'
      });
    }

    // Get current share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const currentLinks = group?.wolke_share_links || [];
    const linkToDelete = currentLinks.find(link => link.id === shareId);

    if (!linkToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Share-Link nicht gefunden.'
      });
    }

    // Remove the link from the array
    const updatedLinks = currentLinks.filter(link => link.id !== shareId);

    // Update the group
    const result = await postgres.update(
      'groups',
      { wolke_share_links: updatedLinks },
      { id: groupId }
    );

    if (!result || result.length === 0) {
      throw new Error('Fehler beim Löschen des Share-Links');
    }


    res.json({
      success: true,
      deletedId: shareId,
      message: 'Wolke-Link erfolgreich aus der Gruppe entfernt.'
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/share-links/:shareId DELETE] Error:', error);
    
    if (error.message.includes('Keine Berechtigung')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen des Wolke-Links.'
    });
  }
});

/**
 * Test connection to a Wolke share
 * POST /groups/:groupId/wolke/test-connection
 */
router.post('/:groupId/wolke/test-connection', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { shareLink } = req.body;


    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    if (!shareLink) {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ist erforderlich.'
      });
    }

    // Import NextcloudApiClient for testing
    const { default: NextcloudApiClient } = await import('../../services/api-clients/nextcloudApiClient');
    
    // Test connection
    const client = new NextcloudApiClient(shareLink);
    const testResult = await client.testConnection();

    res.json(testResult);

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/test-connection POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Testen der Verbindung.'
    });
  }
});

/**
 * Upload test file to Wolke share
 * POST /groups/:groupId/wolke/upload-test
 */
router.post('/:groupId/wolke/upload-test', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { shareLinkId, content, filename } = req.body;


    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Validate required fields
    if (!shareLinkId || !content || !filename) {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ID, Content und Filename sind erforderlich.'
      });
    }

    // Get the group's share link
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const shareLinks = group?.wolke_share_links || [];
    const shareLink = shareLinks.find(link => link.id === shareLinkId && link.is_active);

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        message: 'Share-Link nicht gefunden oder inaktiv.'
      });
    }

    // Import NextcloudApiClient for upload
    const { default: NextcloudApiClient } = await import('../../services/api-clients/nextcloudApiClient');
    
    // Upload the file
    const client = new NextcloudApiClient(shareLink.share_link);
    const uploadResult = await client.uploadFile(content, filename);

    res.json(uploadResult);

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/upload-test POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Test-Upload.'
    });
  }
});

/**
 * Get group's Wolke sync status
 * GET /groups/:groupId/wolke/sync-status
 */
router.get('/:groupId/wolke/sync-status', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;


    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Get sync statuses for this group
    const syncStatuses = await postgres.query(
      'SELECT * FROM wolke_sync_status WHERE context_type = $1 AND context_id = $2 ORDER BY last_sync_at DESC',
      ['group', groupId]
    );


    res.json({
      success: true,
      syncStatuses: syncStatuses || []
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/sync-status GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Abrufen der Sync-Status.'
    });
  }
});

/**
 * Start Wolke folder sync for group
 * POST /groups/:groupId/wolke/sync
 */
router.post('/:groupId/wolke/sync', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { shareLinkId, folderPath = '' } = req.body;


    // Check if user is member of the group (all members can sync)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    if (!shareLinkId) {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ID ist erforderlich.'
      });
    }

    // Import WolkeSyncService for group sync
    const { getWolkeSyncService } = await import('../../services/wolkeSyncService.js');
    const wolkeSyncService = getWolkeSyncService();

    // Start sync in background with group context
    wolkeSyncService.syncFolderWithContext('group', groupId, userId, shareLinkId, folderPath)
      .then(result => {
      })
      .catch(error => {
        log.error(`[User Groups /groups/:groupId/wolke/sync POST] Sync failed:`, error);
      });

    res.json({
      success: true,
      message: 'Synchronisation gestartet.',
      shareLinkId,
      folderPath
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/sync POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Starten der Synchronisation.'
    });
  }
});

/**
 * Set auto-sync for group Wolke folder
 * POST /groups/:groupId/wolke/auto-sync
 */
router.post('/:groupId/wolke/auto-sync', ensureAuthenticated, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { shareLinkId, folderPath = '', enabled } = req.body;


    // Check if user is admin of the group (only admins can set auto-sync)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareLinkId || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Share-Link ID und enabled-Status sind erforderlich.'
      });
    }

    // Import WolkeSyncService for auto-sync
    const { getWolkeSyncService } = await import('../../services/wolkeSyncService.js');
    const wolkeSyncService = getWolkeSyncService();

    // Set auto-sync with group context
    const result = await wolkeSyncService.setAutoSyncWithContext('group', groupId, userId, shareLinkId, folderPath, enabled);

    res.json({
      success: true,
      autoSyncEnabled: enabled,
      message: `Auto-Sync ${enabled ? 'aktiviert' : 'deaktiviert'}.`
    });

  } catch (error) {
    log.error('[User Groups /groups/:groupId/wolke/auto-sync POST] Error:', error);
    
    if (error.message.includes('Keine Berechtigung')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Setzen der Auto-Sync Einstellung.'
    });
  }
});

export default router;