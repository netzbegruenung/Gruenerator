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

// Get group instructions
router.get('/groups/:groupId/instructions', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/instructions GET] Get instructions request for user:', req.user.id);
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

    // Fetch instructions
    const { data: instructions, error: instructionsError } = await supabaseService
      .from('group_instructions')
      .select('group_id, custom_antrag_prompt, custom_social_prompt, antrag_instructions_enabled, social_instructions_enabled')
      .eq('group_id', groupId)
      .maybeSingle();

    if (instructionsError && instructionsError.code !== 'PGRST116') {
      console.error('[User Groups /groups/:groupId/instructions GET] Instructions error:', instructionsError);
      throw new Error(instructionsError.message);
    }

    console.log('[User Groups /groups/:groupId/instructions GET] Instructions loaded successfully');

    res.json({
      success: true,
      instructions: instructions || { 
        group_id: groupId,
        custom_antrag_prompt: '',
        custom_social_prompt: '',
        antrag_instructions_enabled: false,
        social_instructions_enabled: false
      }
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/instructions GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppenanweisungen.'
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

// Get individual knowledge entry
router.get('/groups/:groupId/knowledge/:knowledgeId', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Get knowledge entry request for user:', req.user.id);
    const { groupId, knowledgeId } = req.params;
    const userId = req.user.id;
    
    if (!groupId || !knowledgeId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID und Wissens-ID sind erforderlich.'
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

    // Fetch the specific knowledge entry
    const { data: knowledge, error: knowledgeError } = await supabaseService
      .from('group_knowledge')
      .select('id, title, content, created_by, created_at, updated_at')
      .eq('id', knowledgeId)
      .eq('group_id', groupId)
      .single();

    if (knowledgeError) {
      console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Knowledge error:', knowledgeError);
      if (knowledgeError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Wissenseintrag nicht gefunden.'
        });
      }
      throw new Error(knowledgeError.message);
    }

    console.log('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Knowledge entry loaded successfully');

    res.json({
      success: true,
      knowledge: knowledge
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden des Wissenseintrags.'
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

// === GROUP SHARING ENDPOINTS ===

// Share content to a group
router.post('/groups/:groupId/share', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/share POST] Share content request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    const { contentType, contentId, permissions } = req.body;
    
    console.log('[User Groups /groups/:groupId/share POST] Request parameters:', {
      groupId,
      userId,
      requestBody: req.body,
      contentType,
      contentId,
      permissions
    });
    
    if (!groupId || !contentType || !contentId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.'
      });
    }

    // Validate content type
    const validContentTypes = ['documents', 'custom_generators', 'qa_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
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

    // Verify user owns the content
    console.log('[User Groups /groups/:groupId/share POST] Verifying content ownership:', {
      contentType,
      contentId,
      userId,
      table: contentType
    });
    
    // Handle database table (for templates) with type filtering
    let ownershipQuery = supabaseService
      .from(contentType)
      .select('user_id')
      .eq('id', contentId);
    
    // For database, also filter by type = 'template'
    if (contentType === 'database') {
      ownershipQuery = ownershipQuery.eq('type', 'template');
    }
    
    const { data: contentOwnership, error: ownershipError } = await ownershipQuery.single();

    if (ownershipError) {
      console.error('[User Groups /groups/:groupId/share POST] Content ownership verification failed:', {
        contentType,
        contentId,
        userId,
        error: ownershipError,
        errorCode: ownershipError.code,
        errorMessage: ownershipError.message,
        errorDetails: ownershipError.details
      });
      return res.status(404).json({
        success: false,
        message: 'Inhalt nicht gefunden.'
      });
    }

    console.log('[User Groups /groups/:groupId/share POST] Content ownership verified:', {
      contentOwnership,
      userIdMatches: contentOwnership.user_id === userId
    });

    if (contentOwnership.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht der Besitzer dieses Inhalts.'
      });
    }

    // Check if content is already shared with this group via junction table
    const { data: existingShare, error: shareCheckError } = await supabaseService
      .from('group_content_shares')
      .select('id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('group_id', groupId)
      .single();

    if (shareCheckError && shareCheckError.code !== 'PGRST116') {
      console.error('[User Groups /groups/:groupId/share POST] Share check error:', shareCheckError);
      throw new Error('Fehler beim Überprüfen der Freigabe.');
    }

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
    const { error: shareError } = await supabaseService
      .from('group_content_shares')
      .insert({
        content_type: contentType,
        content_id: contentId,
        group_id: groupId,
        shared_by_user_id: userId,
        permissions: sharePermissions
      });

    if (shareError) {
      console.error('[User Groups /groups/:groupId/share POST] Share error:', shareError);
      throw new Error(shareError.message);
    }

    console.log('[User Groups /groups/:groupId/share POST] Content shared successfully');

    res.json({
      success: true,
      message: 'Inhalt erfolgreich mit der Gruppe geteilt.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/share POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Teilen des Inhalts.'
    });
  }
});

// Unshare content from a group
router.delete('/groups/:groupId/share', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/share DELETE] Unshare content request for user:', req.user.id);
    const { groupId } = req.params;
    const userId = req.user.id;
    const { contentType, contentId } = req.body;
    
    console.log('[User Groups /groups/:groupId/share DELETE] Request parameters:', {
      groupId,
      userId,
      requestBody: req.body,
      contentType,
      contentId
    });
    
    if (!groupId || !contentType || !contentId) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.'
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

    // Verify the share exists and user owns it or has permission to unshare
    const { data: shareRecord, error: shareCheckError } = await supabaseService
      .from('group_content_shares')
      .select('shared_by_user_id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('group_id', groupId)
      .single();

    if (shareCheckError) {
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
    const { error: unshareError } = await supabaseService
      .from('group_content_shares')
      .delete()
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('group_id', groupId);

    if (unshareError) {
      console.error('[User Groups /groups/:groupId/share DELETE] Unshare error:', unshareError);
      throw new Error(unshareError.message);
    }

    console.log('[User Groups /groups/:groupId/share DELETE] Content unshared successfully');

    res.json({
      success: true,
      message: 'Inhalt wurde erfolgreich aus der Gruppe entfernt.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/share DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des Inhalts aus der Gruppe.'
    });
  }
});

// Get all content shared with a group
router.get('/groups/:groupId/content', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/content GET] Get group content request for user:', req.user.id);
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

    // Fetch group knowledge entries
    const { data: groupKnowledge, error: knowledgeError } = await supabaseService
      .from('group_knowledge')
      .select('id, title, content, created_by, created_at, updated_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (knowledgeError) {
      console.error('[User Groups /groups/:groupId/content GET] Knowledge error:', knowledgeError);
    }

    // Fetch shared content using junction table
    const { data: sharedContent, error: fetchError } = await supabaseService
      .from('group_content_shares')
      .select(`
        content_type,
        content_id,
        shared_at,
        permissions,
        shared_by_user_id,
        profiles!shared_by_user_id(first_name, display_name)
      `)
      .eq('group_id', groupId)
      .order('shared_at', { ascending: false });

    if (fetchError) {
      console.error('Shared content fetch error:', fetchError);
      throw new Error('Fehler beim Laden der geteilten Inhalte.');
    }

    // Group shared content by type for easier processing
    const contentByType = {
      documents: [],
      custom_generators: [],
      qa_collections: [],
      user_documents: [],
      database: []
    };

    sharedContent.forEach(share => {
      if (contentByType[share.content_type]) {
        contentByType[share.content_type].push(share);
      }
    });

    // Fetch actual content details for each type
    const contentPromises = [];

    // Documents
    if (contentByType.documents.length > 0) {
      const documentIds = contentByType.documents.map(s => s.content_id);
      contentPromises.push(
        supabaseService
          .from('documents')
          .select('id, title, filename, file_size, status, created_at, updated_at, user_id')
          .in('id', documentIds)
          .then(result => ({ type: 'documents', result, shares: contentByType.documents }))
      );
    }

    // Custom Generators
    if (contentByType.custom_generators.length > 0) {
      const generatorIds = contentByType.custom_generators.map(s => s.content_id);
      contentPromises.push(
        supabaseService
          .from('custom_generators')
          .select('id, name, title, description, created_at, updated_at, user_id')
          .in('id', generatorIds)
          .then(result => ({ type: 'custom_generators', result, shares: contentByType.custom_generators }))
      );
    }

    // Q&A Collections
    if (contentByType.qa_collections.length > 0) {
      const qaIds = contentByType.qa_collections.map(s => s.content_id);
      contentPromises.push(
        supabaseService
          .from('qa_collections')
          .select('id, name, description, view_count, created_at, updated_at, user_id')
          .in('id', qaIds)
          .then(result => ({ type: 'qa_collections', result, shares: contentByType.qa_collections }))
      );
    }

    // User Documents (Texts)
    if (contentByType.user_documents.length > 0) {
      const textIds = contentByType.user_documents.map(s => s.content_id);
      contentPromises.push(
        supabaseService
          .from('user_documents')
          .select('id, title, document_type, word_count, character_count, created_at, updated_at, user_id')
          .in('id', textIds)
          .then(result => ({ type: 'user_documents', result, shares: contentByType.user_documents }))
      );
    }

    // Templates (User Content)
    if (contentByType.database.length > 0) {
      const templateIds = contentByType.database.map(s => s.content_id);
      contentPromises.push(
        supabaseService
          .from('database')
          .select('id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id')
          .in('id', templateIds)
          .eq('type', 'template')
          .then(result => ({ type: 'database', result, shares: contentByType.database }))
      );
    }

    const contentResults = await Promise.all(contentPromises);

    // Process and format results
    const groupContent = {
      knowledge: groupKnowledge || [],
      documents: [],
      generators: [],
      qas: [],
      texts: [],
      templates: []
    };

    contentResults.forEach(({ type, result, shares }) => {
      if (result.error) {
        console.error(`${type} fetch error:`, result.error);
        return;
      }

      const items = (result.data || []).map(item => {
        // Find the corresponding share info
        const shareInfo = shares.find(s => s.content_id === item.id);
        
        return {
          ...item,
          contentType: type,
          shared_at: shareInfo?.shared_at,
          group_permissions: shareInfo?.permissions,
          shared_by_name: shareInfo?.profiles?.display_name || shareInfo?.profiles?.first_name || 'Unknown User',
          // Add template-specific fields for database
          ...(type === 'database' && {
            template_type: item.metadata?.template_type || 'canva',
            canva_url: item.external_url
          })
        };
      });

      // Map to the correct groupContent key
      const keyMap = {
        documents: 'documents',
        custom_generators: 'generators',
        qa_collections: 'qas',
        user_documents: 'texts',
        database: 'templates'
      };

      groupContent[keyMap[type]] = items;
    });

    console.log('[User Groups /groups/:groupId/content GET] Group content loaded successfully');

    res.json({
      success: true,
      content: groupContent
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/content GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Gruppeninhalte.'
    });
  }
});

// Update content permissions
router.put('/groups/:groupId/content/:contentId/permissions', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Update permissions request for user:', req.user.id);
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
    const validContentTypes = ['documents', 'custom_generators', 'qa_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
      });
    }

    // Check if user is admin or content owner
    // Handle database table (for templates) with type filtering
    let contentQuery = supabaseService
      .from(contentType)
      .select('user_id, group_id')
      .eq('id', contentId);
    
    // For database, also filter by type = 'template'
    if (contentType === 'database') {
      contentQuery = contentQuery.eq('type', 'template');
    }
    
    const [membershipResult, contentResult] = await Promise.all([
      supabaseService
        .from('group_memberships')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single(),
      contentQuery.single()
    ]);

    if (membershipResult.error) {
      return res.status(403).json({
        success: false,
        message: 'Du bist nicht Mitglied dieser Gruppe.'
      });
    }

    if (contentResult.error) {
      return res.status(404).json({
        success: false,
        message: 'Inhalt nicht gefunden.'
      });
    }

    const isAdmin = membershipResult.data.role === 'admin';
    const isOwner = contentResult.data.user_id === userId;
    const isInGroup = contentResult.data.group_id === groupId;

    if (!isInGroup) {
      return res.status(400).json({
        success: false,
        message: 'Inhalt ist nicht mit dieser Gruppe geteilt.'
      });
    }

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Ändern der Berechtigungen.'
      });
    }

    // Update permissions
    const { error: updateError } = await supabaseService
      .from(contentType)
      .update({
        group_permissions: permissions
      })
      .eq('id', contentId);

    if (updateError) {
      console.error('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }

    console.log('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Permissions updated successfully');

    res.json({
      success: true,
      message: 'Berechtigungen erfolgreich aktualisiert.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren der Berechtigungen.'
    });
  }
});

// Remove content from group (unshare)
router.delete('/groups/:groupId/content/:contentId', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Groups /groups/:groupId/content/:contentId DELETE] Unshare content request for user:', req.user.id);
    const { groupId, contentId } = req.params;
    const userId = req.user.id;
    const { contentType } = req.body;
    
    console.log('[User Groups /groups/:groupId/content/:contentId DELETE] Request parameters:', {
      groupId,
      contentId,
      userId,
      requestBody: req.body,
      contentType
    });
    
    if (!groupId || !contentId || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'Gruppen-ID, Content-ID und Content-Type sind erforderlich.'
      });
    }

    // Validate content type - include database for templates
    const validContentTypes = ['documents', 'custom_generators', 'qa_collections', 'user_documents', 'database'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiger Content-Type.'
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
    const { data: shareRecord, error: shareCheckError } = await supabaseService
      .from('group_content_shares')
      .select('shared_by_user_id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('group_id', groupId)
      .single();

    if (shareCheckError) {
      console.error('[User Groups /groups/:groupId/content/:contentId DELETE] Share check error:', shareCheckError);
      return res.status(404).json({
        success: false,
        message: 'Geteilter Inhalt nicht gefunden.'
      });
    }

    // Remove from junction table (same logic as the other unshare endpoint)
    const { error: unshareError } = await supabaseService
      .from('group_content_shares')
      .delete()
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('group_id', groupId);

    if (unshareError) {
      console.error('[User Groups /groups/:groupId/content/:contentId DELETE] Unshare error:', unshareError);
      throw new Error(unshareError.message);
    }

    console.log('[User Groups /groups/:groupId/content/:contentId DELETE] Content unshared successfully');

    res.json({
      success: true,
      message: 'Inhalt erfolgreich aus der Gruppe entfernt.'
    });
    
  } catch (error) {
    console.error('[User Groups /groups/:groupId/content/:contentId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des geteilten Inhalts.'
    });
  }
});

export default router;