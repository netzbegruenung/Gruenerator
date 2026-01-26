import apiClient from '../../../components/utils/apiClient';
import {
  getRobotAvatarPath,
  validateRobotId,
  getRobotAvatarAlt,
} from '../../groups/utils/avatarUtils';

export interface Profile {
  avatar_robot_id?: string | number;
  display_name?: string;
  email?: string | null;
  username?: string;
  keycloak_id?: string | null;
  is_admin?: boolean;
  bundestag_api_enabled?: boolean;
  igel_modus?: boolean;
  beta_features?: Record<string, unknown>;
  memory_enabled?: boolean;
  [key: string]: unknown;
}

export interface BundleOptions {
  includeAnweisungen?: boolean;
  includeNotebookCollections?: boolean;
  includeCustomGenerators?: boolean;
  includeUserTexts?: boolean;
  includeUserTemplates?: boolean;
  includeMemories?: boolean;
}

// === INSTRUCTION & KNOWLEDGE TYPES ===
export interface KnowledgeEntry {
  id?: string | number;
  title?: string;
  content?: string;
}

export interface AnweisungenWissen {
  antragPrompt?: string;
  antragGliederung?: string;
  socialPrompt?: string;
  presseabbinder?: string;
  knowledge?: KnowledgeEntry[];
}

export interface GroupAnweisungenWissen extends AnweisungenWissen {
  customPrompt?: string;
  groupInfo?: {
    [key: string]: unknown;
  };
  userRole?: string;
  isAdmin?: boolean;
  membership?: {
    role?: string;
    isAdmin?: boolean;
  };
  joinToken?: string;
  instructionsEnabled?: boolean;
}

export interface InstructionsStatusResponse {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface AnweisungenSaveData {
  // Group-specific (only customPrompt)
  customPrompt?: string;
  instructionsEnabled?: boolean;
  // User-specific (still supported for personal instructions)
  customAntragPrompt?: string;
  customAntragGliederung?: string;
  customSocialPrompt?: string;
  presseabbinder?: string;
  knowledge?: KnowledgeEntry[];
  _groupMembership?: {
    isAdmin: boolean;
    role?: string;
  };
}

export interface AnweisungenSaveResponse {
  success: boolean;
  message?: string;
  skipSave?: boolean;
  [key: string]: unknown;
}

// === Q&A COLLECTION TYPES ===
export interface QACollectionData {
  name: string;
  description?: string;
  custom_prompt?: string;
  selectionMode?: 'documents' | 'wolke';
  documents?: (string | number)[];
  wolkeShareLinks?: string[];
  auto_sync?: boolean;
  remove_missing_on_sync?: boolean;
}

export interface QACollection extends QACollectionData {
  id: string | number;
}

export interface QACollectionResponse {
  success: boolean;
  message?: string;
  collection?: QACollection;
  collections?: QACollection[];
  [key: string]: unknown;
}

// === CUSTOM GENERATOR TYPES ===
export interface CustomGeneratorData {
  name: string;
  prompt?: string;
  [key: string]: unknown;
}

export interface CustomGenerator extends CustomGeneratorData {
  id: string | number;
}

export interface CustomGeneratorResponse {
  success?: boolean;
  message?: string;
  generator?: CustomGenerator;
  generators?: CustomGenerator[];
  [key: string]: unknown;
}

// === SAVED TEXT TYPES ===
export interface SavedText {
  id: string | number;
  title: string;
  content?: string;
  [key: string]: unknown;
}

export interface SavedTextResponse {
  success: boolean;
  message?: string;
  data?: SavedText[];
  [key: string]: unknown;
}

export interface SavedTextMetadata {
  title?: string;
}

// === USER TEMPLATE TYPES ===
export interface UserTemplate {
  id: string | number;
  title: string;
  is_private?: boolean;
  [key: string]: unknown;
}

export interface UserTemplateResponse {
  success: boolean;
  message?: string;
  data?: UserTemplate[];
  [key: string]: unknown;
}

export interface UserTemplateUpdateData {
  is_private?: boolean;
  title?: string;
  [key: string]: unknown;
}

// === DOCUMENT TYPES ===
export interface Document {
  id: string | number;
  status: 'completed' | 'processing' | 'failed';
  [key: string]: unknown;
}

export interface DocumentResponse {
  success: boolean;
  message?: string;
  data?: Document[];
  [key: string]: unknown;
}

// === MEMORY TYPES ===
export interface Memory {
  id: string | number;
  content: string;
  topic?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface MemoryResponse {
  success: boolean;
  message?: string;
  memories?: Memory[];
  [key: string]: unknown;
}

// === PROFILE BUNDLE ===
export interface ProfileBundle {
  profile: Profile;
  anweisungenWissen: AnweisungenWissen | null;
  notebookCollections: QACollection[] | null;
  customGenerators: CustomGenerator[] | null;
  userTexts: SavedText[] | null;
  userTemplates: UserTemplate[] | null;
  memories: Memory[] | null;
}

export interface ProfileUpdateData {
  display_name?: string;
  username?: string | null;
  email?: string | null;
  custom_prompt?: string | null;
}

// === AVATAR DISPLAY TYPES ===
export interface RobotAvatarDisplay {
  type: 'robot';
  src: string;
  alt: string;
  robotId: number;
}

export interface InitialsAvatarDisplay {
  type: 'initials';
  initials: string;
}

export type AvatarDisplay = RobotAvatarDisplay | InitialsAvatarDisplay;

export interface ProfileFormFields {
  displayName: string;
  username: string;
  email: string;
}

// === ERROR RESPONSE TYPE ===
interface ApiErrorWithResponse extends Error {
  response?: { status: number };
}

export const profileApiService = {
  // === PROFILE DATA ===
  async getProfile(): Promise<Profile> {
    const response = await apiClient.get('/auth/profile');
    const data = response.data;
    const profile = data.user || data.profile || null;

    if (!profile) {
      throw new Error('Profil nicht gefunden');
    }

    const profileData: Profile = {
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
      memory_enabled: profile.memory_enabled || false,
    };

    return profileData;
  },

  async getBundledProfileData(options: BundleOptions = {}): Promise<ProfileBundle> {
    const {
      includeAnweisungen = true,
      includeNotebookCollections = true,
      includeCustomGenerators = true,
      includeUserTexts = false,
      includeUserTemplates = false,
      includeMemories = false,
    } = options;

    const params = new URLSearchParams({
      anweisungen: String(includeAnweisungen),
      notebook_collections: String(includeNotebookCollections),
      custom_generators: String(includeCustomGenerators),
      user_texts: String(includeUserTexts),
      user_templates: String(includeUserTemplates),
      memories: String(includeMemories),
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
      memories: data.memories || null,
    };
  },

  async updateProfile(profileData: ProfileUpdateData): Promise<Profile> {
    const response = await apiClient.put('/auth/profile', profileData);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Profil-Update fehlgeschlagen');
    }

    return result.profile;
  },

  async updateAvatar(avatarRobotId: string | number): Promise<Profile> {
    try {
      const response = await apiClient.patch('/auth/profile/avatar', {
        avatar_robot_id: avatarRobotId,
      });
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
  async getInstructionsStatusForType(instructionType: string): Promise<InstructionsStatusResponse> {
    const response = await apiClient.get(`/auth/instructions-status/${instructionType}`);
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || `Failed to check ${instructionType} instructions status`);
    }

    return data;
  },

  async getAnweisungenWissen(
    context: 'user' | 'group' = 'user',
    groupId: string | null = null
  ): Promise<AnweisungenWissen | GroupAnweisungenWissen> {
    if (context === 'group' && groupId) {
      // Group endpoint - fetch group details which includes instructions and knowledge
      const response = await apiClient.get(`/auth/groups/${groupId}/details`);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch group details');
      }

      // Transform group data to match expected format (only customPrompt for groups)
      return {
        customPrompt: data.instructions.custom_prompt || '',
        knowledge: data.knowledge || [],
        // Additional group data
        groupInfo: data.group,
        userRole: data.membership.role,
        isAdmin: data.membership.isAdmin,
        membership: data.membership,
        joinToken: data.group?.join_token || data.joinToken,
        instructionsEnabled: data.instructions.instructions_enabled || false,
      };
    } else {
      // Individual user endpoint (existing logic)
      const response = await apiClient.get('/auth/anweisungen-wissen');
      const json = response.data;

      return {
        antragPrompt: json.antragPrompt || '',
        antragGliederung: json.antragGliederung || '',
        socialPrompt: json.socialPrompt || '',
        presseabbinder: json.presseabbinder || '',
        knowledge: json.knowledge || [],
      };
    }
  },

  async saveAnweisungenWissen(
    data: AnweisungenSaveData,
    context: 'user' | 'group' = 'user',
    groupId: string | null = null
  ): Promise<AnweisungenSaveResponse> {
    const cleanedKnowledge = (data.knowledge || []).map((entry: KnowledgeEntry) => ({
      id: typeof entry.id === 'string' && entry.id.startsWith('new-') ? undefined : entry.id,
      title: entry.title,
      content: entry.content,
    }));

    if (context === 'group' && groupId) {
      // Check if user has permission to edit group content before making API calls
      // This prevents 403 errors for non-admin group members
      if (data._groupMembership && !data._groupMembership.isAdmin) {
        console.log(
          '[saveAnweisungenWissen] User is not admin, skipping group save to prevent 403 errors'
        );
        return {
          success: true,
          message: 'Nur Gruppenadministratoren können Gruppeninhalte bearbeiten.',
          skipSave: true,
        };
      }
      // Group endpoint - save instructions and knowledge separately
      const promises = [];

      // Save unified instruction
      const instructionsPayload = {
        custom_prompt: data.customPrompt,
        instructions_enabled: true,
      };

      const instructionsPromise = apiClient
        .put(`/auth/groups/${groupId}/instructions`, instructionsPayload)
        .then((response) => {
          const respData = response.data;
          if (!respData.success) {
            throw new Error(respData.message || 'Failed to update instructions');
          }
          return respData;
        });

      promises.push(instructionsPromise);

      // Handle knowledge entries - implement proper create/update operations
      if (cleanedKnowledge && cleanedKnowledge.length > 0) {
        const knowledgePromises = cleanedKnowledge.map(async (entry: KnowledgeEntry) => {
          // Determine if this is a new entry or an update
          const isNewEntry =
            !entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'));

          if (isNewEntry) {
            // Create new knowledge entry
            const response = await apiClient.post(`/auth/groups/${groupId}/knowledge`, {
              title: entry.title || 'Untitled',
              content: entry.content || '',
            });
            return response.data;
          } else {
            // Update existing knowledge entry
            const response = await apiClient.put(`/auth/groups/${groupId}/knowledge/${entry.id}`, {
              title: entry.title || 'Untitled',
              content: entry.content || '',
            });
            return response.data;
          }
        });

        // Wait for all knowledge operations to complete
        const knowledgeResults = await Promise.all(knowledgePromises);

        // Check if any knowledge operations failed
        const failedKnowledge = knowledgeResults.filter((result) => !result.success);
        if (failedKnowledge.length > 0) {
          throw new Error(`Failed to save ${failedKnowledge.length} knowledge entries`);
        }
      }

      const results = await Promise.all(promises);
      return results[0];
    } else {
      // Individual user endpoint (only active fields - deprecated ones removed)
      const payload = {
        custom_antrag_prompt: data.customAntragPrompt,
        custom_antrag_gliederung: data.customAntragGliederung,
        custom_social_prompt: data.customSocialPrompt,
        presseabbinder: data.presseabbinder,
        knowledge: cleanedKnowledge,
      };

      const response = await apiClient.put('/auth/anweisungen-wissen', payload);
      return response.data;
    }
  },

  async deleteKnowledgeEntry(
    entryId: string | number,
    context: 'user' | 'group' = 'user',
    groupId: string | null = null
  ): Promise<void | string | number> {
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
  async getNotebookCollections(): Promise<QACollection[]> {
    const response = await apiClient.get('/auth/notebook-collections');
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch Q&A collections');
    }

    return json.collections || [];
  },

  async createQACollection(collectionData: QACollectionData): Promise<QACollection> {
    const selectionMode = collectionData.selectionMode || 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      document_ids: selectionMode === 'documents' ? collectionData.documents || [] : [],
      wolke_share_link_ids: selectionMode === 'wolke' ? collectionData.wolkeShareLinks || [] : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : false,
      remove_missing_on_sync:
        selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : false,
    };

    const response = await apiClient.post('/auth/notebook-collections', body);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(
        json?.message || 'Failed to create Q&A collection'
      ) as unknown as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return json.collection;
  },

  async updateQACollection(
    collectionId: string | number,
    collectionData: QACollectionData
  ): Promise<QACollectionResponse> {
    const selectionMode = collectionData.selectionMode || 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      document_ids: selectionMode === 'documents' ? collectionData.documents || [] : [],
      wolke_share_link_ids: selectionMode === 'wolke' ? collectionData.wolkeShareLinks || [] : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : undefined,
      remove_missing_on_sync:
        selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : undefined,
    };

    const response = await apiClient.put(`/auth/notebook-collections/${collectionId}`, body);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(
        json?.message || 'Failed to update Q&A collection'
      ) as unknown as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return json;
  },

  async syncQACollection(collectionId: string | number): Promise<QACollectionResponse> {
    const response = await apiClient.post(`/auth/notebook-collections/${collectionId}/sync`);
    const json = response.data;

    if (!json?.success) {
      const err = new Error(
        json?.message || 'Failed to sync Q&A collection'
      ) as unknown as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return json;
  },

  async deleteQACollection(collectionId: string | number): Promise<QACollectionResponse> {
    const response = await apiClient.delete(`/auth/notebook-collections/${collectionId}`);
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to delete Q&A collection');
    }

    return json;
  },

  // === CUSTOM GENERATORS ===
  async getCustomGenerators(): Promise<CustomGenerator[]> {
    const response = await apiClient.get('/auth/custom_generator');
    return response.data?.generators || [];
  },

  async updateCustomGenerator(
    generatorId: string | number,
    updateData: CustomGeneratorData
  ): Promise<CustomGenerator> {
    const response = await apiClient.put(`/auth/custom_generator/${generatorId}`, updateData);
    return response.data.generator;
  },

  async deleteCustomGenerator(generatorId: string | number): Promise<CustomGeneratorResponse> {
    const response = await apiClient.delete(`/auth/custom_generator/${generatorId}`);
    return response.data;
  },

  async getGeneratorDocuments(generatorId: string | number): Promise<Document[]> {
    const response = await apiClient.get(`/auth/custom_generator/${generatorId}/documents`);
    return response.data.documents || [];
  },

  async addDocumentsToGenerator(
    generatorId: string | number,
    documentIds: string[]
  ): Promise<CustomGeneratorResponse> {
    const response = await apiClient.post(`/auth/custom_generator/${generatorId}/documents`, {
      documentIds: documentIds,
    });
    return response.data;
  },

  async removeDocumentFromGenerator(
    generatorId: string | number,
    documentId: string | number
  ): Promise<CustomGeneratorResponse> {
    const response = await apiClient.delete(
      `/auth/custom_generator/${generatorId}/documents/${documentId}`
    );
    return response.data;
  },

  async createCustomGenerator(
    generatorData: CustomGeneratorData
  ): Promise<CustomGeneratorResponse> {
    const response = await apiClient.post('/auth/custom_generator/create', generatorData);
    return response.data;
  },

  // === SAVED GENERATORS ===
  async getSavedGenerators(): Promise<CustomGenerator[]> {
    const response = await apiClient.get('/auth/saved_generators');
    return response.data?.generators || [];
  },

  async unsaveGenerator(generatorId: string | number): Promise<CustomGeneratorResponse> {
    const response = await apiClient.delete(`/auth/saved_generators/${generatorId}`);
    return response.data;
  },

  // === USER TEXTS ===
  async getUserTexts(): Promise<SavedText[]> {
    const response = await apiClient.get('/auth/saved-texts');
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch texts');
    }

    return data.data || [];
  },

  async updateTextTitle(textId: string | number, newTitle: string): Promise<SavedTextResponse> {
    const response = await apiClient.post(`/auth/saved-texts/${textId}/metadata`, {
      title: newTitle.trim(),
    });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update text title');
    }

    return result;
  },

  async deleteText(textId: string | number): Promise<SavedTextResponse> {
    const response = await apiClient.delete(`/auth/saved-texts/${textId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete text');
    }

    return result;
  },

  // === USER TEMPLATES ===
  async getUserTemplates(): Promise<UserTemplate[]> {
    const response = await apiClient.get('/auth/user-templates');
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch templates');
    }

    return data.data || [];
  },

  async updateTemplateTitle(
    templateId: string | number,
    newTitle: string
  ): Promise<UserTemplateResponse> {
    const response = await apiClient.post(`/auth/user-templates/${templateId}/metadata`, {
      title: newTitle.trim(),
    });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template title');
    }

    return result;
  },

  async deleteTemplate(templateId: string | number): Promise<UserTemplateResponse> {
    const response = await apiClient.delete(`/auth/user-templates/${templateId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete template');
    }

    return result;
  },

  async updateTemplateVisibility(
    templateId: string | number,
    isPrivate: boolean
  ): Promise<UserTemplateResponse> {
    const response = await apiClient.put(`/auth/user-templates/${templateId}`, {
      is_private: isPrivate,
    });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template visibility');
    }

    return result;
  },

  async updateTemplate(
    templateId: string | number,
    data: UserTemplateUpdateData
  ): Promise<UserTemplateResponse> {
    const response = await apiClient.put(`/auth/user-templates/${templateId}`, data);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to update template');
    }

    return result;
  },

  // === AVAILABLE DOCUMENTS (for Q&A) ===
  async getAvailableDocuments(): Promise<Document[]> {
    const response = await apiClient.get('/documents/user');
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch documents');
    }

    // Filter only completed documents
    const completedDocuments = (json.data || []).filter(
      (doc: Document) => doc.status === 'completed'
    );
    return completedDocuments;
  },

  // === MEMORY (MEM0RY) ===
  async getMemories(userId: string): Promise<Memory[]> {
    const response = await apiClient.get(`/mem0/user/${userId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch memories');
    }

    return result.memories || [];
  },

  async addMemory(text: string, topic: string = ''): Promise<MemoryResponse> {
    const response = await apiClient.post('/mem0/add-text', { text, topic });
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to add memory');
    }

    return result;
  },

  async deleteMemory(memoryId: string | number): Promise<MemoryResponse> {
    const response = await apiClient.delete(`/mem0/${memoryId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete memory');
    }

    return result;
  },

  // === PROFILE MUTATIONS (moved from profileUtils.js) ===
  async updateProfileWithValidation(profileData: ProfileUpdateData): Promise<Profile> {
    if (!profileData) throw new Error('Nicht angemeldet');
    return await this.updateProfile(profileData);
  },

  async updateAvatarWithValidation(avatarRobotId: string | number): Promise<Profile> {
    if (!avatarRobotId) throw new Error('Nicht angemeldet');
    return await this.updateAvatar(avatarRobotId);
  },
};

// === AVATAR UTILITIES ===
/**
 * Get initials from display name or email
 * @param {string} displayName - Full display name
 * @param {string} mail - Email address
 * @returns {string} Initials (2 characters)
 */
export const getInitials = (displayName: string | undefined, mail: string | undefined): string => {
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
 * @param {number|string} avatarRobotId - The robot avatar ID
 * @returns {boolean} True if robot avatar should be shown
 */
export const shouldShowRobotAvatar = (avatarRobotId: unknown): boolean => {
  const id = Number(avatarRobotId);
  return !isNaN(id) && id >= 1 && id <= 9;
};

/**
 * Gets the avatar display properties (robot or initials)
 * @param {object} profile - User profile object
 * @returns {object} Avatar display properties
 */
export const getAvatarDisplayProps = (profile: Profile | null): AvatarDisplay => {
  const { avatar_robot_id, display_name, email } = profile || {};

  if (shouldShowRobotAvatar(avatar_robot_id)) {
    return {
      type: 'robot',
      src: getRobotAvatarPath(Number(avatar_robot_id)),
      alt: getRobotAvatarAlt(Number(avatar_robot_id)),
      robotId: validateRobotId(Number(avatar_robot_id)),
    };
  }

  return {
    type: 'initials',
    initials: getInitials(display_name, email || 'User'),
  };
};

/**
 * Initialize profile form fields with safe fallbacks
 * @param {object} profile - Profile data from API
 * @param {object} user - User data from auth
 * @returns {object} Initialized form values
 */
export const initializeProfileFormFields = (
  profile: Profile | null | undefined,
  user: Record<string, unknown> | null | undefined
): ProfileFormFields => {
  const userEmail = typeof user?.email === 'string' ? user.email : '';
  const userName = typeof user?.username === 'string' ? user.username : '';

  const safeName = profile?.display_name || userEmail || userName || 'User';

  const safeUsername = profile?.username || userName || '';

  // Prioritize auth user email if profile email is empty/null
  const syncedEmail =
    profile?.email && typeof profile.email === 'string' && profile.email.trim()
      ? profile.email
      : userEmail;

  return {
    displayName: String(safeName),
    username: safeUsername,
    email: syncedEmail,
  };
};

export default profileApiService;
