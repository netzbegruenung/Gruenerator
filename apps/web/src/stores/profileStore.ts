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
  avatar_robot_id?: string;
  email?: string;
  locale?: string;
  [key: string]: any;
}

interface AnweisungenWissen {
  instructions?: string;
  knowledge?: any[];
  [key: string]: any;
}

interface QACollection {
  id: string;
  name?: string;
  [key: string]: any;
}

interface CustomGenerator {
  id: string;
  name?: string;
  [key: string]: any;
}

interface UserText {
  id: string;
  title?: string;
  content?: string;
  [key: string]: any;
}

interface Memory {
  id: string;
  content?: string;
  [key: string]: any;
}

interface AvailableDocument {
  id: string;
  name?: string;
  [key: string]: any;
}

interface EditModes {
  profile: boolean;
  avatar: boolean;
  anweisungen: boolean;
  qaCollections: boolean;
  customGenerators: Map<string, boolean>;
}

interface UnsavedChanges {
  profile: Record<string, any>;
  anweisungen: Record<string, any>;
  knowledge: Map<string, any>;
  qaCollections: Map<string, any>;
  customGenerators: Map<string, any>;
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
  userTemplates: any[];
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
  syncUserTemplates: (templates: any[] | null) => void;
  syncMemories: (memories: Memory[] | null) => void;
  syncAvailableDocuments: (documents: AvailableDocument[] | null) => void;
  setEditMode: (section: keyof Omit<EditModes, 'customGenerators'>, enabled: boolean) => void;
  setUnsavedChanges: (section: keyof Omit<UnsavedChanges, 'knowledge' | 'qaCollections' | 'customGenerators'>, changes: Record<string, any>) => void;
  clearUnsavedChanges: (section: keyof UnsavedChanges) => void;
  hasUnsavedChanges: (section: keyof UnsavedChanges) => boolean;
  setValidationErrors: (section: keyof Omit<ValidationErrors, 'knowledge' | 'qaCollections' | 'customGenerators'>, errors: Record<string, string>) => void;
  clearValidationErrors: (section: keyof ValidationErrors) => void;
  updateProfileOptimistic: (updates: Partial<Profile>, loadingKey?: keyof OptimisticLoading | null) => void;
  completeOptimisticUpdate: (loadingKey: keyof OptimisticLoading | null, finalData?: Partial<Profile> | null) => void;
  syncWithAuthStore: (profileUpdates: Partial<Profile>) => void;
  rollbackOptimisticUpdate: (originalData: Partial<Profile>, loadingKey?: keyof OptimisticLoading | null) => void;
  updateAvatarOptimistic: (avatarRobotId: string) => Promise<{ avatar_robot_id: string }>;
  updateDisplayNameOptimistic: (displayName: string) => Promise<any>;
  setKnowledgeEntryChanges: (entryId: string, changes: any) => void;
  clearKnowledgeEntryChanges: (entryId: string) => void;
  setKnowledgeEntryLoading: (entryId: string, loading: boolean) => void;
  hasKnowledgeEntryChanges: (entryId: string) => boolean;
  setGeneratorEditMode: (generatorId: string, enabled: boolean) => void;
  setGeneratorChanges: (generatorId: string, changes: any) => void;
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
        knowledge: new Map<string, any>(),
        qaCollections: new Map<string, any>(),
        customGenerators: new Map<string, any>()
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
        (state.editModes as any)[section] = enabled;
        if (!enabled && (state.unsavedChanges as any)[section]) {
          (state.unsavedChanges as any)[section] = {};
        }
      }),

      setUnsavedChanges: (section, changes) => set(state => {
        (state.unsavedChanges as any)[section] = { ...(state.unsavedChanges as any)[section], ...changes };
      }),

      clearUnsavedChanges: (section) => set(state => {
        const value = (state.unsavedChanges as any)[section];
        if (value instanceof Map) {
          value.clear();
        } else {
          (state.unsavedChanges as any)[section] = {};
        }
      }),

      hasUnsavedChanges: (section) => {
        const changes = (get().unsavedChanges as any)[section];
        if (changes instanceof Map) {
          return changes.size > 0;
        }
        return Object.keys(changes || {}).length > 0;
      },

      setValidationErrors: (section, errors) => set(state => {
        (state.validationErrors as any)[section] = errors;
      }),

      clearValidationErrors: (section) => set(state => {
        const value = (state.validationErrors as any)[section];
        if (value instanceof Map) {
          value.clear();
        } else {
          (state.validationErrors as any)[section] = {};
        }
      }),

      updateProfileOptimistic: (updates, loadingKey = null) => set(state => {
        state.profile = { ...state.profile, ...updates } as Profile;
        if (loadingKey) {
          (state.optimisticLoading as any)[loadingKey] = true;
        }
      }),

      completeOptimisticUpdate: (loadingKey, finalData = null) => set(state => {
        if (loadingKey) {
          (state.optimisticLoading as any)[loadingKey] = false;
        }
        if (finalData) {
          state.profile = { ...state.profile, ...finalData } as Profile;
        }
      }),

      syncWithAuthStore: (profileUpdates) => {
        try {
          const authState = useAuthStore.getState();
          if (authState.user && profileUpdates) {
            // Ensure locale is a valid SupportedLocale type
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
          console.warn('[ProfileStore] Could not sync with authStore:', error);
        }
      },

      rollbackOptimisticUpdate: (originalData, loadingKey = null) => set(state => {
        state.profile = { ...state.profile, ...originalData } as Profile;
        if (loadingKey) {
          (state.optimisticLoading as any)[loadingKey] = false;
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
        } catch (error: any) {
          get().rollbackOptimisticUpdate({ display_name: currentName }, 'displayName');
          get().syncWithAuthStore({ display_name: currentName });
          get().setMessage(`Name-Update fehlgeschlagen: ${error.message}`, 'error');
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
          knowledge: new Map<string, any>(),
          qaCollections: new Map<string, any>(),
          customGenerators: new Map<string, any>()
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
export const useProfileEditMode = (section: keyof Omit<EditModes, 'customGenerators'>) => useProfileStore(state => (state.editModes as any)[section]);
export const useProfileUnsavedChanges = (section: keyof UnsavedChanges) => useProfileStore(state => (state.unsavedChanges as any)[section]);
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
