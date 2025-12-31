
import apiClient from '../../../components/utils/apiClient';
import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from '../../groups/utils/avatarUtils';

export const profileApiService = {
  // === PROFILE DATA ===
  async getProfile() {
    const response = await apiClient.get('/auth/profile');
    const data = response.data;
    const profile = data.user || data.profile || null;

    if (!profile) {
      throw new Error('Profil nicht gefunden');
    }

    const profileData = {
      display_name: profile.display_name,
      email: profile.email || null,
      avatar_robot_id: profile.avatar_robot_id,
      is_admin: profile.is_admin,
      username: profile.username,
      keycloak_id: profile.keycloak_id,
      // Add missing profile fields that are needed for frontend state management
      bundestag_api_enabled: profile.bundestag_api_enabled || false,
      igel_modus: profile.igel_modus || false,
      beta_features: profile.beta_features || {},
      memory_enabled: profile.memory_enabled || false
    };

    return profileData;
  },

  async getBundledProfileData(options = {}) {
    const {
      includeAnweisungen = true,
      includeNotebookCollections = true,
      includeCustomGenerators = true,
      includeUserTexts = false,
      includeUserTemplates = false,
      includeMemories = false
    } = options;

    const params = new URLSearchParams({
      anweisungen: includeAnweisungen,
      notebook_collections: includeNotebookCollections,
      custom_generators: includeCustomGenerators,
      user_texts: includeUserTexts,
      user_templates: includeUserTemplates,
      memories: includeMemories
    });

    const response = await apiClient.get(`/auth/profile/bundle?${params}`);
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || 'Fehler beim Laden der Profildaten');
    }

    return {
      profile: data.profile,
      anweisungenWissen: data.anweisungen_wissen || null,
      notebookCollections: data.notebook_collections || null,
      customGenerators: data.custom_generators || null,
      userTexts: data.user_texts || null,
      userTemplates: data.user_templates || null,
      memories: data.memories || null
    };
  },

  async updateProfile(profileData) {
    const response = await apiClient.put('/auth/profile', profileData);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Profil-Update fehlgeschlagen');
    }

    return result.profile;
  },

  async updateAvatar(avatarRobotId) {
    try {
      const response = await apiClient.patch('/auth/profile/avatar', { avatar_robot_id: avatarRobotId });
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Avatar-Update fehlgeschlagen');
      }

      if (!result.profile) {
        throw new Error('Server returned success but no profile data');
      }

      return result.profile;
    } catch (error) {
      console.error(`[ProfileAPI] Avatar update failed for robot ID ${avatarRobotId}:`, error);
      throw error;
    }
  },

  // === ANWEISUNGEN & WISSEN ===
  async getInstructionsStatusForType(instructionType) {
    const response = await apiClient.get(`/auth/instructions-status/${instructionType}`);
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || `Failed to check ${instructionType} instructions status`);
    }

    return data;
  },

  async getAnweisungenWissen(context = 'user', groupId = null) {
    if (context === 'group' && groupId) {
      // Group endpoint - fetch group details which includes instructions and knowledge
      const response = await apiClient.get(`/auth/groups/${groupId}/details`);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch group details');
      }

      // Transform group data to match expected format
      return {
        antragPrompt: data.instructions.custom_antrag_prompt || '',
        antragGliederung: data.instructions.custom_antrag_gliederung || '',
        socialPrompt: data.instructions.custom_social_prompt || '',
        universalPrompt: data.instructions.custom_universal_prompt || '',
        redePrompt: data.instructions.custom_rede_prompt || '',
        buergeranfragenPrompt: data.instructions.custom_buergeranfragen_prompt || '',
        gruenejugendPrompt: data.instructions.custom_gruenejugend_prompt || '',
        presseabbinder: data.instructions.presseabbinder || '',
        knowledge: data.knowledge || [],
        // Additional group data
        groupInfo: data.group,
        userRole: data.membership.role,
        isAdmin: data.membership.isAdmin,
        joinToken: data.group?.join_token || data.joinToken,
        antragInstructionsEnabled: data.instructions.antrag_instructions_enabled || false,
        socialInstructionsEnabled: data.instructions.social_instructions_enabled || false
      };
    } else {
      // Individual user endpoint (existing logic)
      const response = await apiClient.get('/auth/anweisungen-wissen');
      const json = response.data;

      return {
        antragPrompt: json.antragPrompt || '',
        antragGliederung: json.antragGliederung || '',
        socialPrompt: json.socialPrompt || '',
        universalPrompt: json.universalPrompt || '',
        gruenejugendPrompt: json.gruenejugendPrompt || '',
        redePrompt: json.redePrompt || '',
        buergeranfragenPrompt: json.buergeranfragenPrompt || '',
        presseabbinder: json.presseabbinder || '',
        knowledge: json.knowledge || []
      };
    }
  },

  async saveAnweisungenWissen(data, context = 'user', groupId = null) {
    const cleanedKnowledge = data.knowledge.map(entry => ({
      id: typeof entry.id === 'string' && entry.id.startsWith('new-') ? undefined : entry.id,
      title: entry.title,
      content: entry.content
    }));

    if (context === 'group' && groupId) {
      // Check if user has permission to edit group content before making API calls
      // This prevents 403 errors for non-admin group members
      if (data._groupMembership && !data._groupMembership.isAdmin) {
        console.log('[saveAnweisungenWissen] User is not admin, skipping group save to prevent 403 errors');
        return {
          success: true,
          message: 'Nur Gruppenadministratoren können Gruppeninhalte bearbeiten.',
          skipSave: true
        };
      }
      // Group endpoint - save instructions and knowledge separately
      const promises = [];

      // Save instructions if they exist
      const instructionsPayload = {
        custom_antrag_prompt: data.customAntragPrompt,
        custom_antrag_gliederung: data.customAntragGliederung,
        custom_social_prompt: data.customSocialPrompt,
        custom_universal_prompt: data.customUniversalPrompt,
        custom_rede_prompt: data.customRedePrompt,
        custom_buergeranfragen_prompt: data.customBuergeranfragenPrompt,
        custom_gruenejugend_prompt: data.customGruenejugendPrompt,
        presseabbinder: data.presseabbinder,
        antrag_instructions_enabled: data.antragInstructionsEnabled,
        social_instructions_enabled: data.socialInstructionsEnabled
      };

      const instructionsPromise = apiClient.put(`/auth/groups/${groupId}/instructions`, instructionsPayload)
        .then(response => {
          const respData = response.data;
          if (!respData.success) {
            throw new Error(respData.message || 'Failed to update instructions');
          }
          return respData;
        });

      promises.push(instructionsPromise);

      // Handle knowledge entries - implement proper create/update operations
      if (cleanedKnowledge && cleanedKnowledge.length > 0) {
        const knowledgePromises = cleanedKnowledge.map(async (entry) => {
          // Determine if this is a new entry or an update
          const isNewEntry = !entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'));

          if (isNewEntry) {
            // Create new knowledge entry
            const response = await apiClient.post(`/auth/groups/${groupId}/knowledge`, {
              title: entry.title || 'Untitled',
              content: entry.content || ''
            });
            return response.data;
          } else {
            // Update existing knowledge entry
            const response = await apiClient.put(`/auth/groups/${groupId}/knowledge/${entry.id}`, {
              title: entry.title || 'Untitled',
              content: entry.content || ''
            });
            return response.data;
          }
        });

        // Wait for all knowledge operations to complete
        const knowledgeResults = await Promise.all(knowledgePromises);

        // Check if any knowledge operations failed
        const failedKnowledge = knowledgeResults.filter(result => !result.success);
        if (failedKnowledge.length > 0) {
          throw new Error(`Failed to save ${failedKnowledge.length} knowledge entries`);
        }
      }

      const results = await Promise.all(promises);
      return results[0];

    } else {
      // Individual user endpoint (existing logic)
      const payload = {
        custom_antrag_prompt: data.customAntragPrompt,
        custom_antrag_gliederung: data.customAntragGliederung,
        custom_social_prompt: data.customSocialPrompt,
        custom_universal_prompt: data.customUniversalPrompt,
        custom_gruenejugend_prompt: data.customGruenejugendPrompt,
        custom_rede_prompt: data.customRedePrompt,
        custom_buergeranfragen_prompt: data.customBuergeranfragenPrompt,
        presseabbinder: data.presseabbinder,
        knowledge: cleanedKnowledge
      };

      const response = await apiClient.put('/auth/anweisungen-wissen', payload);
      return response.data;
    }
  },

  async deleteKnowledgeEntry(entryId, context = 'user', groupId = null) {
    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      return;
    }

    let url;
    if (context === 'group' && groupId) {
      url = `/auth/groups/${groupId}/knowledge/${entryId}`;
    } else {
      url = `/auth/anweisungen-wissen/${entryId}`;
    }

    await apiClient.delete(url);
    return entryId;
  },

  // === Q&A COLLECTIONS ===
  async getNotebookCollections() {
    const response = await apiClient.get('/auth/notebook-collections');
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch Q&A collections');
    }

    return json.collections || [];
  },

  async createQACollection(collectionData) {
    const selectionMode = collectionData.selectionMode || 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      document_ids: selectionMode === 'documents' ? (collectionData.documents || []) : [],
      wolke_share_link_ids: selectionMode === 'wolke' ? (collectionData.wolkeShareLinks || []) : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : false,
      remove_missing_on_sync: selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : false
    };

    const response = await apiClient.post('/auth/notebook-collections', body);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(json?.message || 'Failed to create Q&A collection');
      err.response = { status: 400 };
      throw err;
    }

    return json.collection;
  },

  async updateQACollection(collectionId, collectionData) {
    const selectionMode = collectionData.selectionMode || 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      document_ids: selectionMode === 'documents' ? (collectionData.documents || []) : [],
      wolke_share_link_ids: selectionMode === 'wolke' ? (collectionData.wolkeShareLinks || []) : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : undefined,
      remove_missing_on_sync: selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : undefined
    };

    const response = await apiClient.put(`/auth/notebook-collections/${collectionId}`, body);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(json?.message || 'Failed to update Q&A collection');
      err.response = { status: 400 };
      throw err;
    }

    return json;
  },

  async syncQACollection(collectionId) {
    const response = await apiClient.post(`/auth/notebook-collections/${collectionId}/sync`);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(json?.message || 'Failed to sync Q&A collection');
      err.response = { status: 400 };
      throw err;
    }

    return json;
  },

  async deleteQACollection(collectionId) {
    const response = await apiClient.delete(`/auth/notebook-collections/${collectionId}`);
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to delete Q&A collection');
    }

    return json;
  },

  // === CUSTOM GENERATORS ===
  async getCustomGenerators() {
    const response = await apiClient.get('/auth/custom_generator');
    return response.data?.generators || [];
  },

  async updateCustomGenerator(generatorId, updateData) {
    const response = await apiClient.put(`/auth/custom_generator/${generatorId}`, updateData);
    return response.data.generator;
  },

  async deleteCustomGenerator(generatorId) {
    const response = await apiClient.delete(`/auth/custom_generator/${generatorId}`);
    return response.data;
  },

  async getGeneratorDocuments(generatorId) {
    const response = await apiClient.get(`/auth/custom_generator/${generatorId}/documents`);
    return response.data.documents || [];
  },

  async addDocumentsToGenerator(generatorId, documentIds) {
    const response = await apiClient.post(`/auth/custom_generator/${generatorId}/documents`, {
      documentIds: documentIds
    });
    return response.data;
  },

  async removeDocumentFromGenerator(generatorId, documentId) {
    const response = await apiClient.delete(`/auth/custom_generator/${generatorId}/documents/${documentId}`);
    return response.data;
  },

  async createCustomGenerator(generatorData) {
    const response = await apiClient.post('/auth/custom_generator/create', generatorData);
    return response.data;
  },

  // === SAVED GENERATORS ===
  async getSavedGenerators() {
    const response = await apiClient.get('/auth/saved_generators');
    return response.data?.generators || [];
  },

  async unsaveGenerator(generatorId) {
    const response = await apiClient.delete(`/auth/saved_generators/${generatorId}`);
    return response.data;
  },

  // === USER TEXTS ===
  async getUserTexts() {
    const response = await apiClient.get('/auth/saved-texts');
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch texts');
    }

    return data.data || [];
  },

  async updateTextTitle(textId, newTitle) {
    const response = await apiClient.post(`/auth/saved-texts/${textId}/metadata`, { title: newTitle.trim() });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update text title');
    }

    return result;
  },

  async deleteText(textId) {
    const response = await apiClient.delete(`/auth/saved-texts/${textId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete text');
    }

    return result;
  },

  // === USER TEMPLATES ===
  async getUserTemplates() {
    const response = await apiClient.get('/auth/user-templates');
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch templates');
    }

    return data.data || [];
  },

  async updateTemplateTitle(templateId, newTitle) {
    const response = await apiClient.post(`/auth/user-templates/${templateId}/metadata`, { title: newTitle.trim() });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template title');
    }

    return result;
  },

  async deleteTemplate(templateId) {
    const response = await apiClient.delete(`/auth/user-templates/${templateId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete template');
    }

    return result;
  },

  async updateTemplateVisibility(templateId, isPrivate) {
    const response = await apiClient.put(`/auth/user-templates/${templateId}`, { is_private: isPrivate });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template visibility');
    }

    return result;
  },

  async updateTemplate(templateId, data) {
    const response = await apiClient.put(`/auth/user-templates/${templateId}`, data);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template');
    }

    return result;
  },

  // === AVAILABLE DOCUMENTS (for Q&A) ===
  async getAvailableDocuments() {
    const response = await apiClient.get('/documents/user');
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch documents');
    }

    // Filter only completed documents
    const completedDocuments = (json.data || []).filter(doc => doc.status === 'completed');
    return completedDocuments;
  },

  // === MEMORY (MEM0RY) ===
  async getMemories(userId) {
    const response = await apiClient.get(`/mem0/user/${userId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch memories');
    }

    return result.memories || [];
  },

  async addMemory(text, topic = '') {
    const response = await apiClient.post('/mem0/add-text', { text, topic });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to add memory');
    }

    return result;
  },

  async deleteMemory(memoryId) {
    const response = await apiClient.delete(`/mem0/${memoryId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete memory');
    }

    return result;
  },

  // === PROFILE MUTATIONS (moved from profileUtils.js) ===
  async updateProfileWithValidation(profileData) {
    if (!profileData) throw new Error('Nicht angemeldet');
    return await this.updateProfile(profileData);
  },

  async updateAvatarWithValidation(avatarRobotId) {
    if (!avatarRobotId) throw new Error('Nicht angemeldet');
    return await this.updateAvatar(avatarRobotId);
  }
};

// === AVATAR UTILITIES ===
/**
 * Get initials from display name or email
 * @param {string} displayName - Full display name
 * @param {string} mail - Email address
 * @returns {string} Initials (2 characters)
 */
export const getInitials = (displayName, mail) => {
  if (displayName && displayName.trim()) {
    const nameParts = displayName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
    } else {
      return displayName.substring(0, 2).toUpperCase();
    }
  } else if (mail) {
    return mail.substring(0, 2).toUpperCase();
  }
  return 'U'; // Default fallback
};

/**
 * Determines whether to show a robot avatar or initials
 * @param {number} avatarRobotId - The robot avatar ID
 * @returns {boolean} True if robot avatar should be shown
 */
export const shouldShowRobotAvatar = (avatarRobotId) => {
  return avatarRobotId && avatarRobotId >= 1 && avatarRobotId <= 9;
};


/**
 * Gets the avatar display properties (robot or initials)
 * @param {object} profile - User profile object
 * @returns {object} Avatar display properties
 */
export const getAvatarDisplayProps = (profile) => {
  const { avatar_robot_id, display_name, email } = profile || {};
  
  if (shouldShowRobotAvatar(avatar_robot_id)) {
    return {
      type: 'robot',
      src: getRobotAvatarPath(avatar_robot_id),
      alt: getRobotAvatarAlt(avatar_robot_id),
      robotId: validateRobotId(avatar_robot_id)
    };
  }
  
  return {
    type: 'initials',
    initials: getInitials(display_name, email || 'User')
  };
};

// === FORM UTILITIES ===
/**
 * Initialize profile form fields with safe fallbacks
 * @param {object} profile - Profile data from API
 * @param {object} user - User data from auth
 * @returns {object} Initialized form values
 */
export const initializeProfileFormFields = (profile, user) => {
  const safeName = profile?.display_name || 
                   user?.email || user?.username || 'User';
  
  const safeUsername = profile?.username || user?.username || '';
  
  // Prioritize auth user email if profile email is empty/null
  const syncedEmail = (profile?.email && profile.email.trim()) ? 
                      profile.email : 
                      (user?.email || '');
  
  return {
    displayName: safeName,
    username: safeUsername,
    email: syncedEmail
  };
};

export default profileApiService;
