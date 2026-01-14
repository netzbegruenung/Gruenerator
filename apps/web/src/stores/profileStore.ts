import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { enableMapSet } from 'immer';
import { profileApiService } from '../features/auth/services/profileApiService';
import { useAuthStore } from './authStore';

enableMapSet();

const EMPTY_OBJECT = Object.freeze({});

interface Profile {
  display_name?: string;
  avatar_robot_id?: string | number;
  email?: string | null;
  locale?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  auto_save_on_export?: boolean;
  [key: string]: unknown;
}

interface KnowledgeEntry {
  id: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

interface AnweisungenWissen {
  instructions?: string;
  knowledge?: KnowledgeEntry[];
}

interface QACollection {
  id: string;
  name?: string;
}

interface CustomGenerator {
  id: string;
  name?: string;
  title?: string;
  prompt?: string;
  slug?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
}

interface UserText {
  id: string;
  title?: string;
  content?: string;
}

interface Memory {
  id: string;
  content?: string;
}

interface AvailableDocument {
  id: string;
  name?: string;
}

interface EditModes {
  profile: boolean;
  avatar: boolean;
  anweisungen: boolean;
  qaCollections: boolean;
  customGenerators: Map<string, boolean>;
}

interface KnowledgeChanges {
  content?: string;
  updated_at?: string;
}

interface QAChanges {
  name?: string;
  questions?: unknown[];
}

interface GeneratorChanges {
  name?: string;
  prompt?: string;
}

interface UnsavedChanges {
  profile: Record<string, unknown>;
  anweisungen: Record<string, unknown>;
  knowledge: Map<string, KnowledgeChanges>;
  qaCollections: Map<string, QAChanges>;
  customGenerators: Map<string, GeneratorChanges>;
}

interface ValidationErrors {
  profile: Record<string, string>;
  anweisungen: Record<string, string>;
  knowledge: Map<string, Record<string, string>>;
  qaCollections: Map<string, Record<string, string>>;
  customGenerators: Map<string, Record<string, string>>;
}

interface OptimisticLoading {
  avatar: boolean;
  displayName: boolean;
  betaFeatures: Set<string>;
  anweisungen: boolean;
  knowledge: Set<string>;
  customGenerators: Set<string>;
}

type BooleanLoadingKey = 'avatar' | 'displayName' | 'anweisungen';

interface Messages {
  success: string;
  error: string;
  timestamp: number | null;
}

interface ActiveContext {
  type: 'user' | 'group';
  groupId: string | null;
  groupName: string | null;
}

interface ShareModalContent {
  type: string;
  id: string;
  title: string;
}

interface ShareModal {
  isOpen: boolean;
  content: ShareModalContent | null;
}

interface IntegrationsUI {
  currentTab: string;
  canvaSubsection: string;
  shareModal: ShareModal;
}

interface EditState {
  editModes: EditModes;
  hasChanges: {
    profile: boolean;
    anweisungen: boolean;
    knowledge: boolean;
  };
  isLoading: OptimisticLoading;
}

interface ProfileStore {
  profile: Profile | null;
  anweisungenWissen: AnweisungenWissen | null;
  qaCollections: QACollection[];
  customGenerators: CustomGenerator[];
  savedGenerators: CustomGenerator[];
  userTexts: UserText[];
  userTemplates: unknown[];
  memories: Memory[];
  availableDocuments: AvailableDocument[];
  editModes: EditModes;
  unsavedChanges: UnsavedChanges;
  validationErrors: ValidationErrors;
  optimisticLoading: OptimisticLoading;
  messages: Messages;
  activeContext: ActiveContext;
  integrationsUI: IntegrationsUI;

  syncProfile: (profileData: Profile | null) => void;
  syncAnweisungenWissen: (data: AnweisungenWissen | null) => void;
  syncQACollections: (collections: QACollection[] | null) => void;
  syncCustomGenerators: (generators: CustomGenerator[] | null) => void;
  syncSavedGenerators: (generators: CustomGenerator[] | null) => void;
  syncUserTexts: (texts: UserText[] | null) => void;
  syncUserTemplates: (templates: unknown[] | null) => void;
  syncMemories: (memories: Memory[] | null) => void;
  syncAvailableDocuments: (documents: AvailableDocument[] | null) => void;
  setEditMode: (section: keyof Omit<EditModes, 'customGenerators'>, enabled: boolean) => void;
  setUnsavedChanges: (section: keyof Omit<UnsavedChanges, 'knowledge' | 'qaCollections' | 'customGenerators'>, changes: Record<string, unknown>) => void;
  clearUnsavedChanges: (section: keyof UnsavedChanges) => void;
  hasUnsavedChanges: (section: keyof UnsavedChanges) => boolean;
  setValidationErrors: (section: keyof Omit<ValidationErrors, 'knowledge' | 'qaCollections' | 'customGenerators'>, errors: Record<string, string>) => void;
  clearValidationErrors: (section: keyof ValidationErrors) => void;
  updateProfileOptimistic: (updates: Partial<Profile>, loadingKey?: BooleanLoadingKey | null) => void;
  completeOptimisticUpdate: (loadingKey: BooleanLoadingKey | null, finalData?: Partial<Profile> | null) => void;
  syncWithAuthStore: (profileUpdates: Partial<Profile>) => void;
  rollbackOptimisticUpdate: (originalData: Partial<Profile>, loadingKey?: BooleanLoadingKey | null) => void;
  updateAvatarOptimistic: (avatarRobotId: string) => Promise<{ avatar_robot_id: string }>;
  updateDisplayNameOptimistic: (displayName: string) => Promise<Partial<Profile>>;
  setKnowledgeEntryChanges: (entryId: string, changes: KnowledgeChanges) => void;
  clearKnowledgeEntryChanges: (entryId: string) => void;
  setKnowledgeEntryLoading: (entryId: string, loading: boolean) => void;
  hasKnowledgeEntryChanges: (entryId: string) => boolean;
  setGeneratorEditMode: (generatorId: string, enabled: boolean) => void;
  setGeneratorChanges: (generatorId: string, changes: GeneratorChanges) => void;
  clearGeneratorChanges: (generatorId: string) => void;
  hasGeneratorChanges: (generatorId: string) => boolean;
  setGeneratorLoading: (generatorId: string, loading: boolean) => void;
  setGeneratorValidationErrors: (generatorId: string, errors: Record<string, string>) => void;
  updateGeneratorOptimistic: (generatorId: string, updates: Partial<CustomGenerator>) => void;
  deleteGeneratorOptimistic: (generatorId: string) => void;
  clearAllGeneratorEditModes: () => void;
  setActiveContext: (type: 'user' | 'group', groupId?: string | null, groupName?: string | null) => void;
  resetToUserContext: () => void;
  setIntegrationTab: (tab: string) => void;
  setCanvaSubsection: (subsection: string) => void;
  openShareModal: (contentType: string, contentId: string, contentTitle: string) => void;
  closeShareModal: () => void;
  initializeIntegrationTab: (initialTab: string, canAccessCanva: boolean) => void;
  setMessage: (message: string, type?: 'success' | 'error') => void;
  clearMessages: () => void;
  reset: () => void;
  getEditState: () => EditState;
}

export const useProfileStore = create<ProfileStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      profile: null,
      anweisungenWissen: null,
      qaCollections: [],
      customGenerators: [],
      savedGenerators: [],
      userTexts: [],
      userTemplates: [],
      memories: [],
      availableDocuments: [],
      editModes: {
        profile: false,
        avatar: false,
        anweisungen: false,
        qaCollections: false,
        customGenerators: new Map<string, boolean>()
      },
      unsavedChanges: {
        profile: {},
        anweisungen: {},
        knowledge: new Map<string, KnowledgeChanges>(),
        qaCollections: new Map<string, QAChanges>(),
        customGenerators: new Map<string, GeneratorChanges>()
      },
      validationErrors: {
        profile: {},
        anweisungen: {},
        knowledge: new Map<string, Record<string, string>>(),
        qaCollections: new Map<string, Record<string, string>>(),
        customGenerators: new Map<string, Record<string, string>>()
      },
      optimisticLoading: {
        avatar: false,
        displayName: false,
        betaFeatures: new Set<string>(),
        anweisungen: false,
        knowledge: new Set<string>(),
        customGenerators: new Set<string>()
      },
      messages: {
        success: '',
        error: '',
        timestamp: null
      },
      activeContext: {
        type: 'user',
        groupId: null,
        groupName: null
      },
      integrationsUI: {
        currentTab: 'wolke',
        canvaSubsection: 'overview',
        shareModal: {
          isOpen: false,
          content: null
        }
      },

      syncProfile: (profileData) => set(state => {
        if (!state.editModes.profile && !state.optimisticLoading.avatar) {
          state.profile = profileData;
        } else if (state.optimisticLoading.avatar && profileData) {
          const optimisticAvatarId = state.profile?.avatar_robot_id;
          state.profile = {
            ...profileData,
            avatar_robot_id: optimisticAvatarId || profileData.avatar_robot_id
          };
        }
      }),

      syncAnweisungenWissen: (data) => set(state => {
        if (!state.editModes.anweisungen) {
          state.anweisungenWissen = data;
        }
      }),

      syncQACollections: (collections) => set(state => {
        state.qaCollections = collections || [];
      }),

      syncCustomGenerators: (generators) => set(state => {
        state.customGenerators = generators || [];
      }),

      syncSavedGenerators: (generators) => set(state => {
        state.savedGenerators = generators || [];
      }),

      syncUserTexts: (texts) => set(state => {
        state.userTexts = texts || [];
      }),

      syncUserTemplates: (templates) => set(state => {
        state.userTemplates = templates || [];
      }),

      syncMemories: (memories) => set(state => {
        state.memories = memories || [];
      }),

      syncAvailableDocuments: (documents) => set(state => {
        state.availableDocuments = documents || [];
      }),

      setEditMode: (section, enabled) => set(state => {
        if (section === 'profile') {
          state.editModes.profile = enabled;
          if (!enabled) {
            state.unsavedChanges.profile = {};
          }
        } else if (section === 'avatar') {
          state.editModes.avatar = enabled;
        } else if (section === 'anweisungen') {
          state.editModes.anweisungen = enabled;
          if (!enabled) {
            state.unsavedChanges.anweisungen = {};
          }
        } else if (section === 'qaCollections') {
          state.editModes.qaCollections = enabled;
          if (!enabled) {
            state.unsavedChanges.qaCollections.clear();
          }
        }
      }),

      setUnsavedChanges: (section, changes) => set(state => {
        if (section === 'profile') {
          state.unsavedChanges.profile = { ...state.unsavedChanges.profile, ...changes };
        } else if (section === 'anweisungen') {
          state.unsavedChanges.anweisungen = { ...state.unsavedChanges.anweisungen, ...changes };
        }
      }),

      clearUnsavedChanges: (section) => set(state => {
        if (section === 'profile' || section === 'anweisungen') {
          state.unsavedChanges[section] = {};
        } else if (section === 'knowledge' || section === 'qaCollections' || section === 'customGenerators') {
          state.unsavedChanges[section].clear();
        }
      }),

      hasUnsavedChanges: (section) => {
        const unsavedChanges = get().unsavedChanges;
        if (section === 'profile' || section === 'anweisungen') {
          return Object.keys(unsavedChanges[section] || {}).length > 0;
        } else if (section === 'knowledge' || section === 'qaCollections' || section === 'customGenerators') {
          return unsavedChanges[section].size > 0;
        }
        return false;
      },

      setValidationErrors: (section, errors) => set(state => {
        if (section === 'profile') {
          state.validationErrors.profile = errors;
        } else if (section === 'anweisungen') {
          state.validationErrors.anweisungen = errors;
        }
      }),

      clearValidationErrors: (section) => set(state => {
        if (section === 'profile' || section === 'anweisungen') {
          state.validationErrors[section] = {};
        } else if (section === 'knowledge' || section === 'qaCollections' || section === 'customGenerators') {
          state.validationErrors[section].clear();
        }
      }),

      updateProfileOptimistic: (updates, loadingKey = null) => set(state => {
        state.profile = { ...state.profile, ...updates } as Profile;
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = true;
        }
      }),

      completeOptimisticUpdate: (loadingKey, finalData = null) => set(state => {
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = false;
        }
        if (finalData) {
          state.profile = { ...state.profile, ...finalData } as Profile;
        }
      }),

      syncWithAuthStore: (profileUpdates) => {
        try {
          const authState = useAuthStore.getState();
          if (authState.user && profileUpdates) {
            const sanitizedUpdates = {
              ...profileUpdates,
              locale: profileUpdates.locale as 'de-DE' | 'de-AT' | undefined
            };
            authState.setAuthState({
              user: { ...authState.user, ...sanitizedUpdates } as typeof authState.user,
              isAuthenticated: authState.isAuthenticated,
              supabaseSession: authState.supabaseSession
            });
          }
        } catch (error) {
          if (error instanceof Error) {
            console.warn('[ProfileStore] Could not sync with authStore:', error.message);
          } else {
            console.warn('[ProfileStore] Could not sync with authStore:', String(error));
          }
        }
      },

      rollbackOptimisticUpdate: (originalData, loadingKey = null) => set(state => {
        state.profile = { ...state.profile, ...originalData } as Profile;
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = false;
        }
      }),

      updateAvatarOptimistic: async (avatarRobotId) => {
        try {
          get().updateProfileOptimistic({ avatar_robot_id: avatarRobotId }, 'avatar');
          get().syncWithAuthStore({ avatar_robot_id: avatarRobotId });
          setTimeout(() => {
            get().completeOptimisticUpdate('avatar');
          }, 100);
          return { avatar_robot_id: avatarRobotId };
        } catch (error) {
          get().completeOptimisticUpdate('avatar');
          throw error;
        }
      },

      updateDisplayNameOptimistic: async (displayName) => {
        const currentName = get().profile?.display_name;
        try {
          get().updateProfileOptimistic({ display_name: displayName }, 'displayName');
          get().syncWithAuthStore({ display_name: displayName });
          const result = await profileApiService.updateProfile({ display_name: displayName });
          get().completeOptimisticUpdate('displayName', result);
          get().syncWithAuthStore(result);
          get().setMessage('Name erfolgreich aktualisiert!', 'success');
          return result;
        } catch (error) {
          get().rollbackOptimisticUpdate({ display_name: currentName }, 'displayName');
          get().syncWithAuthStore({ display_name: currentName });
          const errorMessage = error instanceof Error ? error.message : String(error);
          get().setMessage(`Name-Update fehlgeschlagen: ${errorMessage}`, 'error');
          throw error;
        }
      },

      setKnowledgeEntryChanges: (entryId, changes) => set(state => {
        state.unsavedChanges.knowledge.set(entryId, changes);
      }),

      clearKnowledgeEntryChanges: (entryId) => set(state => {
        state.unsavedChanges.knowledge.delete(entryId);
        state.validationErrors.knowledge.delete(entryId);
      }),

      setKnowledgeEntryLoading: (entryId, loading) => set(state => {
        if (loading) {
          state.optimisticLoading.knowledge.add(entryId);
        } else {
          state.optimisticLoading.knowledge.delete(entryId);
        }
      }),

      hasKnowledgeEntryChanges: (entryId) => {
        return get().unsavedChanges.knowledge.has(entryId);
      },

      setGeneratorEditMode: (generatorId, enabled) => set(state => {
        if (enabled) {
          state.editModes.customGenerators.set(generatorId, true);
        } else {
          state.editModes.customGenerators.delete(generatorId);
          state.unsavedChanges.customGenerators.delete(generatorId);
          state.validationErrors.customGenerators.delete(generatorId);
        }
      }),

      setGeneratorChanges: (generatorId, changes) => set(state => {
        state.unsavedChanges.customGenerators.set(generatorId, {
          ...state.unsavedChanges.customGenerators.get(generatorId),
          ...changes
        });
      }),

      clearGeneratorChanges: (generatorId) => set(state => {
        state.unsavedChanges.customGenerators.delete(generatorId);
        state.validationErrors.customGenerators.delete(generatorId);
      }),

      hasGeneratorChanges: (generatorId) => {
        return get().unsavedChanges.customGenerators.has(generatorId);
      },

      setGeneratorLoading: (generatorId, loading) => set(state => {
        if (loading) {
          state.optimisticLoading.customGenerators.add(generatorId);
        } else {
          state.optimisticLoading.customGenerators.delete(generatorId);
        }
      }),

      setGeneratorValidationErrors: (generatorId, errors) => set(state => {
        if (Object.keys(errors).length > 0) {
          state.validationErrors.customGenerators.set(generatorId, errors);
        } else {
          state.validationErrors.customGenerators.delete(generatorId);
        }
      }),

      updateGeneratorOptimistic: (generatorId, updates) => set(state => {
        const generatorIndex = state.customGenerators.findIndex(g => g.id === generatorId);
        if (generatorIndex !== -1) {
          state.customGenerators[generatorIndex] = {
            ...state.customGenerators[generatorIndex],
            ...updates
          };
        }
      }),

      deleteGeneratorOptimistic: (generatorId) => set(state => {
        state.customGenerators = state.customGenerators.filter(g => g.id !== generatorId);
        state.editModes.customGenerators.delete(generatorId);
        state.unsavedChanges.customGenerators.delete(generatorId);
        state.validationErrors.customGenerators.delete(generatorId);
        state.optimisticLoading.customGenerators.delete(generatorId);
      }),

      clearAllGeneratorEditModes: () => set(state => {
        state.editModes.customGenerators.clear();
        state.unsavedChanges.customGenerators.clear();
        state.validationErrors.customGenerators.clear();
      }),

      setActiveContext: (type, groupId = null, groupName = null) => set(state => {
        state.activeContext = { type, groupId, groupName };
        state.anweisungenWissen = null;
        state.unsavedChanges.anweisungen = {};
        state.unsavedChanges.knowledge.clear();
        state.validationErrors.anweisungen = {};
        state.validationErrors.knowledge.clear();
      }),

      resetToUserContext: () => {
        get().setActiveContext('user');
      },

      setIntegrationTab: (tab) => set(state => {
        state.integrationsUI.currentTab = tab;
      }),

      setCanvaSubsection: (subsection) => set(state => {
        if (subsection === 'overview' || subsection === 'vorlagen' || subsection === 'assets') {
          state.integrationsUI.canvaSubsection = subsection;
        }
      }),

      openShareModal: (contentType, contentId, contentTitle) => set(state => {
        state.integrationsUI.shareModal = {
          isOpen: true,
          content: {
            type: contentType,
            id: contentId,
            title: contentTitle
          }
        };
      }),

      closeShareModal: () => set(state => {
        state.integrationsUI.shareModal = {
          isOpen: false,
          content: null
        };
      }),

      initializeIntegrationTab: (initialTab, canAccessCanva) => set(state => {
        let normalizedTab = initialTab;
        if (normalizedTab === 'canva' && !canAccessCanva) {
          normalizedTab = 'wolke';
        }
        state.integrationsUI.currentTab = normalizedTab;
      }),

      setMessage: (message, type = 'success') => set(state => {
        state.messages = {
          success: type === 'success' ? message : '',
          error: type === 'error' ? message : '',
          timestamp: Date.now()
        };
      }),

      clearMessages: () => set(state => {
        state.messages = {
          success: '',
          error: '',
          timestamp: null
        };
      }),

      reset: () => set(() => ({
        profile: null,
        anweisungenWissen: null,
        qaCollections: [],
        customGenerators: [],
        savedGenerators: [],
        userTexts: [],
        userTemplates: [],
        memories: [],
        availableDocuments: [],
        editModes: {
          profile: false,
          avatar: false,
          anweisungen: false,
          qaCollections: false,
          customGenerators: new Map<string, boolean>()
        },
        unsavedChanges: {
          profile: {},
          anweisungen: {},
          knowledge: new Map<string, KnowledgeChanges>(),
          qaCollections: new Map<string, QAChanges>(),
          customGenerators: new Map<string, GeneratorChanges>()
        },
        validationErrors: {
          profile: {},
          anweisungen: {},
          knowledge: new Map<string, Record<string, string>>(),
          qaCollections: new Map<string, Record<string, string>>(),
          customGenerators: new Map<string, Record<string, string>>()
        },
        optimisticLoading: {
          avatar: false,
          displayName: false,
          betaFeatures: new Set<string>(),
          anweisungen: false,
          knowledge: new Set<string>(),
          customGenerators: new Set<string>()
        },
        messages: {
          success: '',
          error: '',
          timestamp: null
        },
        activeContext: {
          type: 'user',
          groupId: null,
          groupName: null
        },
        integrationsUI: {
          currentTab: 'wolke',
          canvaSubsection: 'overview',
          shareModal: {
            isOpen: false,
            content: null
          }
        }
      })),

      getEditState: () => {
        const state = get();
        return {
          editModes: state.editModes,
          hasChanges: {
            profile: Object.keys(state.unsavedChanges.profile || {}).length > 0,
            anweisungen: Object.keys(state.unsavedChanges.anweisungen || {}).length > 0,
            knowledge: state.unsavedChanges.knowledge.size > 0
          },
          isLoading: state.optimisticLoading
        };
      }
    }))
  )
);

export const useProfileData = () => useProfileStore(state => state.profile);

export const useProfileEditMode = (section: keyof Omit<EditModes, 'customGenerators'>) =>
  useProfileStore(state => {
    if (section === 'profile') return state.editModes.profile;
    if (section === 'avatar') return state.editModes.avatar;
    if (section === 'anweisungen') return state.editModes.anweisungen;
    if (section === 'qaCollections') return state.editModes.qaCollections;
    return false;
  });

export const useProfileUnsavedChanges = (section: keyof UnsavedChanges) =>
  useProfileStore(state => {
    if (section === 'profile' || section === 'anweisungen') {
      return state.unsavedChanges[section];
    }
    return state.unsavedChanges[section];
  });

export const useProfileMessages = () => useProfileStore(state => state.messages);
export const useProfileOptimisticLoading = () => useProfileStore(state => state.optimisticLoading);

export const useGeneratorEditMode = (generatorId: string) => useProfileStore(state =>
  state.editModes.customGenerators?.get(generatorId) || false
);
export const useGeneratorChanges = (generatorId: string) => useProfileStore(state =>
  state.unsavedChanges.customGenerators?.get(generatorId) || EMPTY_OBJECT
);
export const useGeneratorLoading = (generatorId: string) => useProfileStore(state =>
  state.optimisticLoading.customGenerators?.has(generatorId) || false
);
export const useGeneratorValidationErrors = (generatorId: string) => useProfileStore(state =>
  state.validationErrors.customGenerators?.get(generatorId) || EMPTY_OBJECT
);
export const useCustomGeneratorsList = () => useProfileStore(state => state.customGenerators);

export const useIntegrationTab = () => useProfileStore(state => state.integrationsUI.currentTab);
export const useCanvaSubsection = () => useProfileStore(state => state.integrationsUI.canvaSubsection);
export const useShareModal = () => useProfileStore(state => state.integrationsUI.shareModal);
export const useIntegrationsUI = () => useProfileStore(state => state.integrationsUI);

export default useProfileStore;
