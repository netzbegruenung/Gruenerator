import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import crypto from 'crypto';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add debugging middleware to all groups routes
router.use((req, res, next) => {
  console.log(`[User Groups] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === GROUPS MANAGEMENT ENDPOINTS ===

// Get user groups
router.get('/groups', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups GET] Groups get request for user:', req.user.id);
    
    const userId = req.user.id;
    
    // Get user's group memberships
    const { data: memberships, error: membershipsError } = await supabaseService
      .from('group_memberships')
      .select('group_id, role, joined_at')
      .eq('user_id', userId);

    if (membershipsError) {
      console.error('[User Groups /groups GET] Memberships error:', membershipsError);
      throw new Error(membershipsError.message);
    }

    if (!memberships || memberships.length === 0) {
      return res.json({
        success: true,
        groups: []
      });
    }

    const groupIds = memberships.map(m => m.group_id);
    
    // Get group details
    const { data: groupsData, error: groupsError } = await supabaseService
      .from('groups')
      .select('id, name, description, created_at, created_by, join_token')
      .in('id', groupIds);

    if (groupsError) {
      console.error('[User Groups /groups GET] Groups error:', groupsError);
      throw new Error(groupsError.message);
    }

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
    console.error('[User Groups /groups GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppen.'
    });
  }
});

// Create a new group
router.post('/groups', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups POST] Create group request for user:', req.user.id);
    const { name } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Gruppenname ist erforderlich.'
      });
    }

    const userId = req.user.id;
    const joinToken = crypto.randomBytes(16).toString('hex');

    // 1. Create the group
    const { data: newGroup, error: groupError } = await supabaseService
      .from('groups')
      .insert({
        name: name.trim(),
        created_by: userId,
        join_token: joinToken,
        description: null // Default empty description
      })
      .select('id, name, description, created_at, created_by, join_token')
      .single();

    if (groupError) {
      console.error('[User Groups /groups POST] Group creation error:', groupError);
      throw new Error(groupError.message);
    }

    // 2. Create membership for the creator with admin role
    const { error: membershipError } = await supabaseService
      .from('group_memberships')
      .insert({
        group_id: newGroup.id,
        user_id: userId,
        role: 'admin'
      });

    if (membershipError) {
      console.error('[User Groups /groups POST] Membership creation error:', membershipError);
      throw new Error(membershipError.message);
    }

    // 3. Create empty instructions entry
    const { error: instructionsError } = await supabaseService
      .from('group_instructions')
      .insert({
        group_id: newGroup.id
      });

    if (instructionsError) {
      console.error('[User Groups /groups POST] Instructions creation error:', instructionsError);
      // Non-critical error, continue
    }

    console.log('[User Groups /groups POST] Group created successfully:', newGroup.id);

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
    console.error('[User Groups /groups POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Erstellen der Gruppe.'
    });
  }
});

// Delete a group
router.delete('/groups/:groupId', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups DELETE] Delete group request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // Check if user is authorized to delete the group (creator or admin)
    const { data: groupData, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      console.error('[User Groups /groups DELETE] Group lookup error:', groupError);
      throw new Error('Gruppe nicht gefunden.');
    }

    const isCreator = groupData.created_by === userId;
    
    if (!isCreator) {
      // Check if user is admin
      const { data: membership, error: membershipError } = await supabaseService
        .from('group_memberships')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership || membership.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Keine Berechtigung zum Löschen dieser Gruppe.'
        });
      }
    }

    // Delete in correct order to avoid foreign key constraints
    
    // 1. Delete group knowledge entries
    const { error: knowledgeError } = await supabaseService
      .from('group_knowledge')
      .delete()
      .eq('group_id', groupId);

    if (knowledgeError) {
      console.error('[User Groups /groups DELETE] Knowledge deletion error:', knowledgeError);
    }

    // 2. Delete group instructions
    const { error: instructionsError } = await supabaseService
      .from('group_instructions')
      .delete()
      .eq('group_id', groupId);

    if (instructionsError) {
      console.error('[User Groups /groups DELETE] Instructions deletion error:', instructionsError);
    }

    // 3. Delete group memberships
    const { error: membershipsError } = await supabaseService
      .from('group_memberships')
      .delete()
      .eq('group_id', groupId);

    if (membershipsError) {
      console.error('[User Groups /groups DELETE] Memberships deletion error:', membershipsError);
      throw new Error(membershipsError.message);
    }

    // 4. Delete the group itself
    const { error: deleteGroupError } = await supabaseService
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (deleteGroupError) {
      console.error('[User Groups /groups DELETE] Group deletion error:', deleteGroupError);
      throw new Error(deleteGroupError.message);
    }

    console.log('[User Groups /groups DELETE] Group deleted successfully:', groupId);

    res.json({
      success: true,
      message: 'Gruppe erfolgreich gelöscht.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen der Gruppe.'
    });
  }
});

// Verify join token (for JoinGroupPage)
router.get('/groups/verify-token/:joinToken', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/verify-token GET] Verify token request for user:', req.user.id);
    const { joinToken } = req.params;
    const userId = req.user.id;
    
    if (!joinToken?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
    }

    // 1. Get the group from the token
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('id, name')
      .eq('join_token', joinToken.trim())
      .single();

    if (groupError) {
      console.error('[User Groups /groups/verify-token GET] Group lookup error:', groupError);
      return res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
      });
    }

    // 2. Check if already a member
    const { data: existingMembership, error: membershipCheckError } = await supabaseService
      .from('group_memberships')
      .select('group_id')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipCheckError) {
      console.error('[User Groups /groups/verify-token GET] Membership check error:', membershipCheckError);
      throw new Error('Fehler beim Überprüfen der Mitgliedschaft.');
    }

    console.log('[User Groups /groups/verify-token GET] Token verified successfully');

    res.json({
      success: true,
      group: group,
      alreadyMember: !!existingMembership
    });
    
  } catch (error) {
    console.error('[User Groups /groups/verify-token GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Überprüfen des Einladungslinks.'
    });
  }
});

// Join a group with token
router.post('/groups/join', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/join POST] Join group request for user:', req.user.id);
    const { joinToken } = req.body;
    const userId = req.user.id;
    
    if (!joinToken?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Beitritts-Token ist erforderlich.'
      });
    }

    // 1. Get the group from the token
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('id, name')
      .eq('join_token', joinToken.trim())
      .single();

    if (groupError) {
      console.error('[User Groups /groups/join POST] Group lookup error:', groupError);
      return res.status(404).json({
        success: false,
        message: 'Ungültiger oder abgelaufener Einladungslink.'
      });
    }

    // 2. Check if already a member
    const { data: existingMembership, error: membershipCheckError } = await supabaseService
      .from('group_memberships')
      .select('group_id')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipCheckError) {
      console.error('[User Groups /groups/join POST] Membership check error:', membershipCheckError);
      throw new Error('Fehler beim Überprüfen der Mitgliedschaft.');
    }

    if (existingMembership) {
      return res.json({
        success: true,
        alreadyMember: true,
        group: group,
        message: 'Du bist bereits Mitglied dieser Gruppe.'
      });
    }

    // 3. Create membership
    const { error: createMembershipError } = await supabaseService
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: userId,
        role: 'member'
      });

    if (createMembershipError) {
      console.error('[User Groups /groups/join POST] Membership creation error:', createMembershipError);
      throw new Error(createMembershipError.message);
    }

    console.log('[User Groups /groups/join POST] Successfully joined group:', group.id);

    res.json({
      success: true,
      group: group,
      message: `Erfolgreich der Gruppe "${group.name}" beigetreten.`
    });
    
  } catch (error) {
    console.error('[User Groups /groups/join POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Beitritt zur Gruppe.'
    });
  }
});

// Get group details (info, instructions, knowledge)
router.get('/groups/:groupId/details', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/details GET] Group details request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // 1. Check membership and role
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role, joined_at')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      console.error('[User Groups /groups/:groupId/details GET] Membership error:', membershipError);
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    // 2. Fetch group info
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('id, name, description, created_at, created_by, join_token')
      .eq('id', groupId)
      .single();

    if (groupError) {
      console.error('[User Groups /groups/:groupId/details GET] Group error:', groupError);
      throw new Error(groupError.message);
    }

    // 3. Fetch instructions
    const { data: instructions, error: instructionsError } = await supabaseService
      .from('group_instructions')
      .select('group_id, custom_antrag_prompt, custom_social_prompt, antrag_instructions_enabled, social_instructions_enabled')
      .eq('group_id', groupId)
      .maybeSingle();

    if (instructionsError && instructionsError.code !== 'PGRST116') {
      console.error('[User Groups /groups/:groupId/details GET] Instructions error:', instructionsError);
    }

    // 4. Fetch knowledge
    const { data: knowledge, error: knowledgeError } = await supabaseService
      .from('group_knowledge')
      .select('id, title, content, created_by, created_at, updated_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (knowledgeError) {
      console.error('[User Groups /groups/:groupId/details GET] Knowledge error:', knowledgeError);
    }

    // Determine if user is admin
    const isAdmin = membership.role === 'admin' || group.created_by === userId;

    console.log('[User Groups /groups/:groupId/details GET] Group details loaded successfully');

    res.json({
      success: true,
      group: group,
      instructions: instructions || { 
        group_id: groupId,
        custom_antrag_prompt: '',
        custom_social_prompt: '',
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
    console.error('[User Groups /groups/:groupId/details GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppendetails.'
    });
  }
});

// Update group name and description
router.put('/groups/:groupId/info', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/info PUT] Update group info request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name, description } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // Check if user is admin
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    // Check if user is group creator
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern der Gruppendetails.'
      });
    }

    // Build update object
    const updateData = {};
    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Gruppenname darf nicht leer sein.'
        });
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Keine Änderungen angegeben.'
      });
    }

    // Update group info
    const { error: updateError } = await supabaseService
      .from('groups')
      .update(updateData)
      .eq('id', groupId);

    if (updateError) {
      console.error('[User Groups /groups/:groupId/info PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }

    console.log('[User Groups /groups/:groupId/info PUT] Group info updated successfully');

    res.json({
      success: true,
      message: 'Gruppendetails erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/info PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Gruppendetails.'
    });
  }
});

// Legacy endpoint for backward compatibility
router.put('/groups/:groupId/name', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/name PUT] Update group name request for user:', req.user.id);
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

    // Check if user is admin
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    // Check if user is group creator
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern des Gruppennamens.'
      });
    }

    // Update group name
    const { error: updateError } = await supabaseService
      .from('groups')
      .update({ 
        name: name.trim()
      })
      .eq('id', groupId);

    if (updateError) {
      console.error('[User Groups /groups/:groupId/name PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }

    console.log('[User Groups /groups/:groupId/name PUT] Group name updated successfully');

    res.json({
      success: true,
      message: 'Gruppenname erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/name PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren des Gruppennamens.'
    });
  }
});

// Update group instructions
router.put('/groups/:groupId/instructions', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/instructions PUT] Update instructions request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    const { 
      custom_antrag_prompt, 
      custom_social_prompt,
      antrag_instructions_enabled,
      social_instructions_enabled 
    } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // Check if user is admin
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    // Check if user is group creator
    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Bearbeiten der Gruppenanweisungen.'
      });
    }

    // Update instructions
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (custom_antrag_prompt !== undefined) updateData.custom_antrag_prompt = custom_antrag_prompt;
    if (custom_social_prompt !== undefined) updateData.custom_social_prompt = custom_social_prompt;
    if (antrag_instructions_enabled !== undefined) updateData.antrag_instructions_enabled = antrag_instructions_enabled;
    if (social_instructions_enabled !== undefined) updateData.social_instructions_enabled = social_instructions_enabled;

    const { error: updateError } = await supabaseService
      .from('group_instructions')
      .upsert({ 
        group_id: groupId,
        ...updateData
      });

    if (updateError) {
      console.error('[User Groups /groups/:groupId/instructions PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }

    console.log('[User Groups /groups/:groupId/instructions PUT] Instructions updated successfully');

    res.json({
      success: true,
      message: 'Gruppenanweisungen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/instructions PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Gruppenanweisungen.'
    });
  }
});

// Add knowledge entry
router.post('/groups/:groupId/knowledge', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/knowledge POST] Add knowledge request for user:', req.user.id);
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

    // Check if user is admin (same logic as instructions)
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Hinzufügen von Gruppenwissen.'
      });
    }

    // Insert knowledge entry
    const { data: newKnowledge, error: insertError } = await supabaseService
      .from('group_knowledge')
      .insert({
        group_id: groupId,
        title: title?.trim() || 'Untitled',
        content: content.trim(),
        created_by: userId
      })
      .select('id, title, content, created_by, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('[User Groups /groups/:groupId/knowledge POST] Insert error:', insertError);
      throw new Error(insertError.message);
    }

    console.log('[User Groups /groups/:groupId/knowledge POST] Knowledge added successfully');

    res.json({
      success: true,
      knowledge: newKnowledge,
      message: 'Gruppenwissen erfolgreich hinzugefügt.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/knowledge POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Hinzufügen des Gruppenwissens.'
    });
  }
});

// Update knowledge entry
router.put('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Update knowledge request for user:', req.user.id);
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    const { title, content } = req.body;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
      });
    }

    // Check admin permissions (same as above)
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Bearbeiten von Gruppenwissen.'
      });
    }

    // Update knowledge entry
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title?.trim() || 'Untitled';
    if (content !== undefined) updateData.content = content?.trim() || '';

    const { data: updatedKnowledge, error: updateError } = await supabaseService
      .from('group_knowledge')
      .update(updateData)
      .eq('id', knowledgeId)
      .eq('group_id', groupId)
      .select('id, title, content, created_by, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }

    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Knowledge updated successfully');

    res.json({
      success: true,
      knowledge: updatedKnowledge,
      message: 'Gruppenwissen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren des Gruppenwissens.'
    });
  }
});

// Delete knowledge entry
router.delete('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Delete knowledge request for user:', req.user.id);
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
      });
    }

    // Check admin permissions (same as above)
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    const { data: group, error: groupError } = await supabaseService
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(groupError.message);
    }

    const isAdmin = membership.role === 'admin' || group.created_by === userId;
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Löschen von Gruppenwissen.'
      });
    }

    // Delete knowledge entry
    const { error: deleteError } = await supabaseService
      .from('group_knowledge')
      .delete()
      .eq('id', knowledgeId)
      .eq('group_id', groupId);

    if (deleteError) {
      console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Delete error:', deleteError);
      throw new Error(deleteError.message);
    }

    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Knowledge deleted successfully');

    res.json({
      success: true,
      message: 'Gruppenwissen erfolgreich gelöscht.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen des Gruppenwissens.'
    });
  }
});

// Get group members
router.get('/groups/:groupId/members', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/members GET] Get group members request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID ist erforderlich.'
      });
    }

    // Check if user is member of the group
    const { data: membership, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (membershipError) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    // Get all group members with their profile information
    const { data: members, error: membersError } = await supabaseService
      .from('group_memberships')
      .select(`
        user_id,
        role,
        joined_at,
        profiles!inner(
          first_name,
          display_name,
          avatar_robot_id
        )
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      console.error('[User Groups /groups/:groupId/members GET] Members error:', membersError);
      throw new Error(membersError.message);
    }

    // Format member data
    const formattedMembers = members.map(member => ({
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      first_name: member.profiles?.first_name || null,
      display_name: member.profiles?.display_name || null,
      avatar_robot_id: member.profiles?.avatar_robot_id || 1
    }));

    console.log('[User Groups /groups/:groupId/members GET] Members loaded successfully');

    res.json({
      success: true,
      members: formattedMembers
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/members GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppenmitglieder.'
    });
  }
});

export default router;