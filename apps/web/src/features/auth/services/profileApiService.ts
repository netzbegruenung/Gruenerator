import { getContractsClient } from '@gruenerator/shared/api';
import {
  getRobotAvatarPath,
  validateRobotId,
  getRobotAvatarAlt,
  shouldShowRobotAvatar,
  getInitials,
} from '@gruenerator/shared/avatar';

import apiClient from '../../../components/utils/apiClient';

export interface Profile {
  avatar_robot_id?: string | number;
  display_name?: string;
  email?: string | null;
  username?: string;
  keycloak_id?: string | null;
  is_admin?: boolean;
  bundestag_api_enabled?: boolean;
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
}

// === INSTRUCTION & KNOWLEDGE TYPES ===
export interface KnowledgeEntry {
  id?: string | number;
  title?: string;
  content?: string;
}

export interface AnweisungenWissen {
  presseabbinder?: string;
  knowledge?: KnowledgeEntry[];
}

export interface GroupAnweisungenWissen extends AnweisungenWissen {
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
}

export interface InstructionsStatusResponse {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface AnweisungenSaveData {
  presseabbinder?: string;
  knowledge?: KnowledgeEntry[];
}

export interface AnweisungenSaveResponse {
  success: boolean;
  message?: string;
  skipSave?: boolean;
  [key: string]: unknown;
}

// === Q&A COLLECTION TYPES ===
import type { NotebookCollection, NotebookCollectionInput } from '../../../types/notebook';
import type { CreatedNotebookCollection } from '@gruenerator/contracts';

// === CUSTOM GENERATOR TYPES ===
export interface CustomGeneratorData {
  name: string;
  prompt?: string;
  title?: string;
  slug?: string;
  description?: string;
  contact_email?: string;
  form_schema?: Record<string, unknown>;
  usage_count?: number;
  created_at?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
  [key: string]: unknown;
}

export interface CustomGenerator extends CustomGeneratorData {
  id: string | number;
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

// === PROFILE BUNDLE ===
export interface ProfileBundle {
  profile: Profile;
  anweisungenWissen: AnweisungenWissen | null;
  notebookCollections: NotebookCollection[] | null;
  customGenerators: CustomGenerator[] | null;
  userTexts: SavedText[] | null;
  userTemplates: UserTemplate[] | null;
}

export interface ProfileUpdateData {
  display_name?: string;
  username?: string | null;
  email?: string | null;
  custom_prompt?: string | null;
  memory_enabled?: boolean;
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

// === API RESPONSE SHAPES ===
interface BundleResponse {
  success: boolean;
  message?: string;
  profile: Profile;
  anweisungen_wissen?: AnweisungenWissen | null;
  notebook_collections?: NotebookCollection[] | null;
  custom_generators?: CustomGenerator[] | null;
  user_texts?: SavedText[] | null;
  user_templates?: UserTemplate[] | null;
}

interface AnweisungenResponse {
  presseabbinder?: string;
  knowledge?: KnowledgeEntry[];
}

interface SavedTextsResponse {
  success: boolean;
  message?: string;
  data?: SavedText[];
}

interface SavedTextSingleResponse {
  success: boolean;
  message?: string;
  data: SavedText;
}

interface AvailableDocumentsResponse {
  success: boolean;
  message?: string;
  data?: Document[];
}

export const profileApiService = {
  // === PROFILE DATA ===
  async getProfile(): Promise<Profile> {
    // Typed ts-rest call against the `userProfileContract` (GET /api/auth/profile).
    // Replaces the previous raw `apiClient.get('/auth/profile')`, which hit the
    // same contracted handler but lost the response typing. The legacy
    // `res.json({ user })` route in authCore.ts was a shadowed duplicate and
    // has been removed.
    const res = await getContractsClient().userProfile.getProfile();

    if (res.status !== 200) {
      throw new Error('Profil nicht gefunden');
    }

    const profile = res.body.user;

    const profileData: Profile = {
      display_name: profile.display_name,
      email: profile.email || null,
      avatar_robot_id: profile.avatar_robot_id,
      is_admin: profile.is_admin,
      username: profile.username,
      keycloak_id: profile.keycloak_id,
      // Add missing profile fields that are needed for frontend state management
      bundestag_api_enabled: profile.bundestag_api_enabled || false,
      beta_features: profile.beta_features || {},
      memory_enabled: profile.memory_enabled || false,
      custom_prompt: profile.custom_prompt || '',
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
    } = options;

    const params = new URLSearchParams({
      anweisungen: String(includeAnweisungen),
      notebook_collections: String(includeNotebookCollections),
      custom_generators: String(includeCustomGenerators),
      user_texts: String(includeUserTexts),
      user_templates: String(includeUserTemplates),
    });

    const response = await apiClient.get<BundleResponse>(`/auth/profile/bundle?${params}`);
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message ?? 'Fehler beim Laden der Profildaten');
    }

    return {
      profile: data.profile,
      anweisungenWissen: data.anweisungen_wissen ?? null,
      notebookCollections: data.notebook_collections ?? null,
      customGenerators: data.custom_generators ?? null,
      userTexts: data.user_texts ?? null,
      userTemplates: data.user_templates ?? null,
    };
  },

  async updateProfile(profileData: ProfileUpdateData): Promise<Profile> {
    // The contract body types clearable fields as string|undefined, but
    // ProfileUpdateData uses `null` to clear. Map null -> '' (the backend
    // converts '' -> null), preserving clear semantics under the contract.
    const body: {
      display_name?: string;
      username?: string;
      email?: string;
      custom_prompt?: string;
      memory_enabled?: boolean;
    } = {};
    if (profileData.display_name !== undefined) body.display_name = profileData.display_name;
    if (profileData.memory_enabled !== undefined) body.memory_enabled = profileData.memory_enabled;
    if (profileData.username !== undefined) body.username = profileData.username ?? '';
    if (profileData.email !== undefined) body.email = profileData.email ?? '';
    if (profileData.custom_prompt !== undefined)
      body.custom_prompt = profileData.custom_prompt ?? '';

    const res = await getContractsClient().userProfile.updateProfile({ body });
    if (res.status !== 200) {
      throw new Error(`Profil-Update fehlgeschlagen (HTTP ${res.status})`);
    }

    return res.body.profile;
  },

  async updateAvatar(avatarRobotId: string | number): Promise<Profile> {
    try {
      const res = await getContractsClient().userProfile.updateAvatar({
        body: { avatar_robot_id: Number(avatarRobotId) },
      });

      if (res.status !== 200) {
        throw new Error(`Avatar-Update fehlgeschlagen (HTTP ${res.status})`);
      }

      return res.body.profile;
    } catch (error) {
      console.error(`[ProfileAPI] Avatar update failed for robot ID ${avatarRobotId}:`, error);
      throw error;
    }
  },

  // === ANWEISUNGEN & WISSEN ===
  async getAnweisungenWissen(): Promise<AnweisungenWissen> {
    const response = await apiClient.get<AnweisungenResponse>('/auth/anweisungen-wissen');
    const json = response.data;

    return {
      presseabbinder: json.presseabbinder ?? '',
      knowledge: json.knowledge ?? [],
    };
  },

  async saveAnweisungenWissen(data: AnweisungenSaveData): Promise<AnweisungenSaveResponse> {
    const cleanedKnowledge = (data.knowledge ?? []).map((entry: KnowledgeEntry) => ({
      id: typeof entry.id === 'string' && entry.id.startsWith('new-') ? undefined : entry.id,
      title: entry.title,
      content: entry.content,
    }));

    const payload = {
      presseabbinder: data.presseabbinder,
      knowledge: cleanedKnowledge,
    };

    const response = await apiClient.put<AnweisungenSaveResponse>(
      '/auth/anweisungen-wissen',
      payload
    );
    return response.data;
  },

  async deleteKnowledgeEntry(entryId: string | number): Promise<void | string | number> {
    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      return;
    }

    await apiClient.delete(`/auth/anweisungen-wissen/${entryId}`);
    return entryId;
  },

  // === Q&A COLLECTIONS ===
  async getNotebookCollections(): Promise<NotebookCollection[]> {
    const response = await getContractsClient().notebookCollections.listCollections();

    if (response.status !== 200 || !response.body.success) {
      throw new Error('Failed to fetch Q&A collections');
    }

    return response.body.collections;
  },

  /**
   * Returns what the create endpoint actually sends — a narrower record than a
   * listed collection (no `documents`, no `updated_at`). This used to claim the
   * full type via a cast, which is how a caller could read fields off a response
   * that never carried them.
   */
  async createQACollection(
    collectionData: NotebookCollectionInput
  ): Promise<CreatedNotebookCollection> {
    const selectionMode: 'documents' | 'wolke' =
      collectionData.selectionMode === 'wolke' ? 'wolke' : 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      document_ids:
        selectionMode === 'documents' ? (collectionData.documents || []).map(String) : [],
      wolke_share_link_ids: selectionMode === 'wolke' ? collectionData.wolkeShareLinks || [] : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : false,
      remove_missing_on_sync:
        selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : false,
      ...(Array.isArray(collectionData.labels) ? { labels: collectionData.labels } : {}),
      ...(typeof collectionData.is_public === 'boolean'
        ? { is_public: collectionData.is_public }
        : {}),
      ...(collectionData.public_ownership
        ? { public_ownership: collectionData.public_ownership }
        : {}),
      ...(Array.isArray(collectionData.wolkeFolders)
        ? { wolke_folders: collectionData.wolkeFolders }
        : {}),
      ...(Array.isArray(collectionData.wordpressSites)
        ? { wordpress_sites: collectionData.wordpressSites }
        : {}),
      ...(Array.isArray(collectionData.linkedDocs)
        ? { linked_docs: collectionData.linkedDocs }
        : {}),
    };

    const response = await getContractsClient().notebookCollections.createCollection({ body });

    if (response.status !== 201) {
      const err = new Error('Failed to create Q&A collection') as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return response.body.collection;
  },

  async updateQACollection(
    collectionId: string | number,
    collectionData: NotebookCollectionInput
  ): Promise<{ success: boolean; message?: string }> {
    const selectionMode: 'documents' | 'wolke' =
      collectionData.selectionMode === 'wolke' ? 'wolke' : 'documents';
    const body = {
      name: collectionData.name,
      description: collectionData.description,
      custom_prompt: collectionData.custom_prompt,
      selection_mode: selectionMode,
      // Only send document_ids for a documents-mode edit that actually carries a
      // document set. Omitting it signals a metadata-only edit (e.g. inline rename)
      // so the backend leaves existing documents untouched instead of 400-ing on [].
      ...(selectionMode === 'documents' && Array.isArray(collectionData.documents)
        ? { document_ids: collectionData.documents.map(String) }
        : {}),
      wolke_share_link_ids: selectionMode === 'wolke' ? collectionData.wolkeShareLinks || [] : [],
      auto_sync: selectionMode === 'wolke' ? !!collectionData.auto_sync : undefined,
      remove_missing_on_sync:
        selectionMode === 'wolke' ? !!collectionData.remove_missing_on_sync : undefined,
      ...(Array.isArray(collectionData.labels) ? { labels: collectionData.labels } : {}),
      ...(typeof collectionData.is_public === 'boolean'
        ? { is_public: collectionData.is_public }
        : {}),
      ...(collectionData.public_ownership
        ? { public_ownership: collectionData.public_ownership }
        : {}),
      ...(Array.isArray(collectionData.wolkeFolders)
        ? { wolke_folders: collectionData.wolkeFolders }
        : {}),
      ...(Array.isArray(collectionData.wordpressSites)
        ? { wordpress_sites: collectionData.wordpressSites }
        : {}),
      ...(Array.isArray(collectionData.linkedDocs)
        ? { linked_docs: collectionData.linkedDocs }
        : {}),
    };

    const response = await getContractsClient().notebookCollections.updateCollection({
      params: { id: String(collectionId) },
      body,
    });

    if (response.status !== 200) {
      const err = new Error('Failed to update Q&A collection') as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return { success: response.body.success, message: response.body.message };
  },

  async syncQACollection(
    collectionId: string | number
  ): Promise<{ success: boolean; message?: string }> {
    const response = await getContractsClient().notebookCollections.syncCollection({
      params: { id: String(collectionId) },
    });

    if (response.status !== 200) {
      const err = new Error('Failed to sync Q&A collection') as ApiErrorWithResponse;
      err.response = { status: 400 };
      throw err;
    }

    return { success: response.body.success, message: response.body.message };
  },

  async deleteQACollection(
    collectionId: string | number
  ): Promise<{ success: boolean; message?: string }> {
    const response = await getContractsClient().notebookCollections.deleteCollection({
      params: { id: String(collectionId) },
    });

    if (response.status !== 200) {
      throw new Error('Failed to delete Q&A collection');
    }

    return { success: response.body.success, message: response.body.message };
  },

  // === USER TEXTS ===
  async getUserTexts(): Promise<SavedText[]> {
    const response = await apiClient.get<SavedTextsResponse>('/auth/saved-texts');
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch texts');
    }

    return data.data ?? [];
  },

  async getText(textId: string | number): Promise<SavedText> {
    const response = await apiClient.get<SavedTextSingleResponse>(`/auth/saved-texts/${textId}`);
    const data = response.data;

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch text');
    }

    return data.data;
  },

  async updateTextTitle(textId: string | number, newTitle: string): Promise<SavedTextResponse> {
    const response = await apiClient.post<SavedTextResponse>(
      `/auth/saved-texts/${textId}/metadata`,
      {
        title: newTitle.trim(),
      }
    );
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message ?? 'Failed to update text title');
    }

    return result;
  },

  async deleteText(textId: string | number): Promise<SavedTextResponse> {
    const response = await apiClient.delete<SavedTextResponse>(`/auth/saved-texts/${textId}`);
    const result = response.data;

    if (!result.success) {
      throw new Error(result.message ?? 'Failed to delete text');
    }

    return result;
  },

  // === USER TEMPLATES ===
  async getUserTemplates(): Promise<UserTemplate[]> {
    const response = await getContractsClient().userTemplates.list();

    if (response.status !== 200 || !response.body.success) {
      throw new Error('Failed to fetch templates');
    }

    // Contract's template schema vs the app's UserTemplate domain type describe
    // the same rows but aren't mutually assignable; boundary cast.
    return response.body.data as unknown as UserTemplate[];
  },

  async updateTemplateTitle(
    templateId: string | number,
    newTitle: string
  ): Promise<UserTemplateResponse> {
    const response = await getContractsClient().userTemplates.updateMetadata({
      params: { id: String(templateId) },
      body: { title: newTitle.trim() },
    });

    if (response.status !== 200) {
      throw new Error('Failed to update template title');
    }

    return { success: response.body.success, message: response.body.message };
  },

  async deleteTemplate(templateId: string | number): Promise<UserTemplateResponse> {
    const response = await getContractsClient().userTemplates.remove({
      params: { id: String(templateId) },
    });

    if (response.status !== 200) {
      throw new Error('Failed to delete template');
    }

    return { success: response.body.success, message: response.body.message };
  },

  /**
   * Visibility and lifecycle move together: the gallery only shows rows that
   * are both public AND `published`, so flipping `is_private` alone left
   * "veröffentlichte" templates stranded as drafts — invisible to everyone,
   * including the review queue. The server resolves the actual transition
   * (an already-published template is not pushed back into review).
   */
  async updateTemplateVisibility(
    templateId: string | number,
    isPrivate: boolean
  ): Promise<UserTemplateResponse> {
    const response = await getContractsClient().userTemplates.update({
      params: { id: String(templateId) },
      body: { is_private: isPrivate, status: isPrivate ? 'draft' : 'pending_review' },
    });

    if (response.status !== 200) {
      throw new Error('Failed to update template visibility');
    }

    return { success: response.body.success, message: response.body.message };
  },

  async updateTemplate(
    templateId: string | number,
    data: UserTemplateUpdateData
  ): Promise<UserTemplateResponse> {
    const response = await getContractsClient().userTemplates.update({
      params: { id: String(templateId) },
      body: data,
    });

    if (response.status !== 200) {
      throw new Error('Failed to update template');
    }

    return { success: response.body.success, message: response.body.message };
  },

  // === AVAILABLE DOCUMENTS (for Q&A) ===
  async getAvailableDocuments(): Promise<Document[]> {
    const response = await apiClient.get<AvailableDocumentsResponse>('/documents/user');
    const json = response.data;

    if (!json.success) {
      throw new Error(json.message ?? 'Failed to fetch documents');
    }

    // Filter only completed documents
    const completedDocuments = (json.data ?? []).filter(
      (doc: Document) => doc.status === 'completed'
    );
    return completedDocuments;
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

export { getInitials, shouldShowRobotAvatar };

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
