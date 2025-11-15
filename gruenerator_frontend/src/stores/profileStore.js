import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { enableMapSet } from 'immer';
import { profileApiService } from '../features/auth/services/profileApiService';
import { useAuthStore } from './authStore';

// Enable MapSet support for Immer
enableMapSet();

// Stable empty references for selectors to avoid infinite re-render loops
const EMPTY_OBJECT = Object.freeze({});

/**
 * Unified Profile Store with Hybrid Architecture
 * 
 * This store follows the "Sync Store" pattern:
 * - React Query handles server state, caching, and background sync
 * - Zustand handles UI state, optimistic updates, and form management
 * - Manual sync keeps both systems coordinated
 */
export const useProfileStore = create(
  subscribeWithSelector(
    immer((set, get) => ({
      // === CACHED DATA (synced from React Query) ===
      profile: null,
      anweisungenWissen: null,
      qaCollections: [],
      customGenerators: [],
      userTexts: [],
      userTemplates: [],
      memories: [],
      availableDocuments: [],

      // === UI STATE MANAGEMENT ===
      // Edit modes for different sections
      editModes: {
        profile: false,
        avatar: false,
        anweisungen: false,
        qaCollections: false,
        customGenerators: new Map() // Track edit mode per generator ID
      },

      // Unsaved changes tracking
      unsavedChanges: {
        profile: {},
        anweisungen: {},
        knowledge: new Map(), // Track changes by knowledge entry ID
        qaCollections: new Map(),
        customGenerators: new Map() // Track changes by generator ID
      },

      // Validation state
      validationErrors: {
        profile: {},
        anweisungen: {},
        knowledge: new Map(),
        qaCollections: new Map(),
        customGenerators: new Map() // Track validation errors by generator ID
      },

      // Loading states for optimistic updates
      optimisticLoading: {
        avatar: false,
        displayName: false,
        betaFeatures: new Set(),
        anweisungen: false,
        knowledge: new Set(), // Track loading by knowledge entry ID
        customGenerators: new Set() // Track loading by generator ID
      },

      // Success/error message state
      messages: {
        success: '',
        error: '',
        timestamp: null
      },

      // Active context for group/personal switching
      activeContext: {
        type: 'user', // 'user' | 'group'  
        groupId: null,
        groupName: null
      },

      // Integrations UI state
      integrationsUI: {
        currentTab: 'wolke', // Default to wolke since it's always available
        canvaSubsection: 'overview',
        shareModal: {
          isOpen: false,
          content: null
        }
      },

      // === SYNC METHODS (called by React Query hooks) ===
      
      /**
       * Sync profile data from React Query
       */
      syncProfile: (profileData) => set(state => {
        // Only sync if not currently editing to avoid overwriting user input
        if (!state.editModes.profile && !state.optimisticLoading.avatar) {
          state.profile = profileData;
        } else if (state.optimisticLoading.avatar && profileData) {
          // During avatar update, preserve the optimistic avatar_robot_id
          const optimisticAvatarId = state.profile?.avatar_robot_id;
          state.profile = {
            ...profileData,
            avatar_robot_id: optimisticAvatarId || profileData.avatar_robot_id
          };
        }
      }),

      /**
       * Sync Anweisungen & Wissen from React Query
       */
      syncAnweisungenWissen: (data) => set(state => {
        if (!state.editModes.anweisungen) {
          state.anweisungenWissen = data;
        }
      }),

      /**
       * Sync QA Collections from React Query
       */
      syncQACollections: (collections) => set(state => {
        state.qaCollections = collections || [];
      }),

      /**
       * Sync other data arrays from React Query
       */
      syncCustomGenerators: (generators) => set(state => {
        state.customGenerators = generators || [];
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

      // === UI STATE MANAGEMENT ===

      /**
       * Set edit mode for a specific section
       */
      setEditMode: (section, enabled) => set(state => {
        state.editModes[section] = enabled;
        
        // Clear unsaved changes when exiting edit mode
        if (!enabled && state.unsavedChanges[section]) {
          state.unsavedChanges[section] = {};
        }
      }),

      /**
       * Track unsaved changes for a section
       */
      setUnsavedChanges: (section, changes) => set(state => {
        state.unsavedChanges[section] = { ...state.unsavedChanges[section], ...changes };
      }),

      /**
       * Clear unsaved changes for a section
       */
      clearUnsavedChanges: (section) => set(state => {
        state.unsavedChanges[section] = {};
        if (state.unsavedChanges[section] instanceof Map) {
          state.unsavedChanges[section].clear();
        }
      }),

      /**
       * Check if section has unsaved changes
       */
      hasUnsavedChanges: (section) => {
        const changes = get().unsavedChanges[section];
        if (changes instanceof Map) {
          return changes.size > 0;
        }
        return Object.keys(changes || {}).length > 0;
      },

      /**
       * Set validation errors
       */
      setValidationErrors: (section, errors) => set(state => {
        state.validationErrors[section] = errors;
      }),

      /**
       * Clear validation errors
       */
      clearValidationErrors: (section) => set(state => {
        state.validationErrors[section] = {};
        if (state.validationErrors[section] instanceof Map) {
          state.validationErrors[section].clear();
        }
      }),

      // === OPTIMISTIC UPDATES ===

      /**
       * Optimistically update profile data with immediate UI feedback
       */
      updateProfileOptimistic: (updates, loadingKey = null) => set(state => {
        // Apply optimistic update to UI
        state.profile = { ...state.profile, ...updates };

        // Set loading state if provided
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = true;
        }
      }),

      /**
       * Complete optimistic update (called after successful API call)
       */
      completeOptimisticUpdate: (loadingKey, finalData = null) => set(state => {
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = false;
        }
        
        // Update with final data from server if provided
        if (finalData) {
          state.profile = { ...state.profile, ...finalData };
        }
      }),

      /**
       * Sync profile changes with authStore for unified user identity
       */
      syncWithAuthStore: (profileUpdates) => {
        try {
          const authState = useAuthStore.getState();
          if (authState.user && profileUpdates) {
            // Update specific fields in authStore
            authState.setAuthState({
              user: { ...authState.user, ...profileUpdates },
              isAuthenticated: authState.isAuthenticated,
              supabaseSession: authState.supabaseSession
            });
          }
        } catch (error) {
          console.warn('[ProfileStore] Could not sync with authStore:', error);
        }
      },

      /**
       * Rollback optimistic update (called on API error)
       */
      rollbackOptimisticUpdate: (originalData, loadingKey = null) => set(state => {
        state.profile = { ...state.profile, ...originalData };
        
        if (loadingKey) {
          state.optimisticLoading[loadingKey] = false;
        }
      }),

      /**
       * Optimistic avatar update - UI coordination only, no API calls
       * React Query handles all server communication
       */
      updateAvatarOptimistic: async (avatarRobotId) => {
        try {
          // Update UI state immediately for consistency
          get().updateProfileOptimistic({ avatar_robot_id: avatarRobotId }, 'avatar');

          // Sync with authStore for unified user identity
          get().syncWithAuthStore({ avatar_robot_id: avatarRobotId });

          // Clear loading state after coordination
          setTimeout(() => {
            get().completeOptimisticUpdate('avatar');
          }, 100);

          return { avatar_robot_id: avatarRobotId };
        } catch (error) {
          console.error('[ProfileStore] Error in avatar UI sync:', error);
          get().completeOptimisticUpdate('avatar'); // Clear loading state on error
          throw error;
        }
      },

      /**
       * Optimistic display name update
       */
      updateDisplayNameOptimistic: async (displayName) => {
        const currentName = get().profile?.display_name;
        
        try {
          // Immediate UI update
          get().updateProfileOptimistic({ display_name: displayName }, 'displayName');
          get().syncWithAuthStore({ display_name: displayName });
          
          // API call
          const result = await profileApiService.updateProfile({ display_name: displayName });
          
          // Complete the update
          get().completeOptimisticUpdate('displayName', result);
          get().syncWithAuthStore(result);
          get().setMessage('Name erfolgreich aktualisiert!', 'success');
          
          return result;
        } catch (error) {
          // Rollback on error
          get().rollbackOptimisticUpdate({ display_name: currentName }, 'displayName');
          get().syncWithAuthStore({ display_name: currentName });
          get().setMessage(`Name-Update fehlgeschlagen: ${error.message}`, 'error');
          throw error;
        }
      },

      // === KNOWLEDGE ENTRY MANAGEMENT ===

      /**
       * Track unsaved changes for specific knowledge entry
       */
      setKnowledgeEntryChanges: (entryId, changes) => set(state => {
        state.unsavedChanges.knowledge.set(entryId, changes);
      }),

      /**
       * Clear changes for specific knowledge entry
       */
      clearKnowledgeEntryChanges: (entryId) => set(state => {
        state.unsavedChanges.knowledge.delete(entryId);
        state.validationErrors.knowledge.delete(entryId);
      }),

      /**
       * Set loading state for knowledge entry
       */
      setKnowledgeEntryLoading: (entryId, loading) => set(state => {
        if (loading) {
          state.optimisticLoading.knowledge.add(entryId);
        } else {
          state.optimisticLoading.knowledge.delete(entryId);
        }
      }),

      /**
       * Check if knowledge entry has unsaved changes
       */
      hasKnowledgeEntryChanges: (entryId) => {
        return get().unsavedChanges.knowledge.has(entryId);
      },

      // === CUSTOM GENERATOR MANAGEMENT ===

      /**
       * Set edit mode for specific custom generator
       */
      setGeneratorEditMode: (generatorId, enabled) => set(state => {
        if (enabled) {
          state.editModes.customGenerators.set(generatorId, true);
        } else {
          state.editModes.customGenerators.delete(generatorId);
          // Clear related state when exiting edit mode
          state.unsavedChanges.customGenerators.delete(generatorId);
          state.validationErrors.customGenerators.delete(generatorId);
        }
      }),

      /**
       * Track unsaved changes for specific generator
       */
      setGeneratorChanges: (generatorId, changes) => set(state => {
        state.unsavedChanges.customGenerators.set(generatorId, {
          ...state.unsavedChanges.customGenerators.get(generatorId),
          ...changes
        });
      }),

      /**
       * Clear changes for specific generator
       */
      clearGeneratorChanges: (generatorId) => set(state => {
        state.unsavedChanges.customGenerators.delete(generatorId);
        state.validationErrors.customGenerators.delete(generatorId);
      }),

      /**
       * Check if generator has unsaved changes
       */
      hasGeneratorChanges: (generatorId) => {
        return get().unsavedChanges.customGenerators.has(generatorId);
      },

      /**
       * Set loading state for generator
       */
      setGeneratorLoading: (generatorId, loading) => set(state => {
        if (loading) {
          state.optimisticLoading.customGenerators.add(generatorId);
        } else {
          state.optimisticLoading.customGenerators.delete(generatorId);
        }
      }),

      /**
       * Set validation errors for generator
       */
      setGeneratorValidationErrors: (generatorId, errors) => set(state => {
        if (Object.keys(errors).length > 0) {
          state.validationErrors.customGenerators.set(generatorId, errors);
        } else {
          state.validationErrors.customGenerators.delete(generatorId);
        }
      }),

      /**
       * Optimistically update generator data
       */
      updateGeneratorOptimistic: (generatorId, updates) => set(state => {
        const generatorIndex = state.customGenerators.findIndex(g => g.id === generatorId);
        if (generatorIndex !== -1) {
          state.customGenerators[generatorIndex] = {
            ...state.customGenerators[generatorIndex],
            ...updates
          };
        }
      }),

      /**
       * Optimistically remove generator from list
       */
      deleteGeneratorOptimistic: (generatorId) => set(state => {
        state.customGenerators = state.customGenerators.filter(g => g.id !== generatorId);
        // Clean up associated state
        state.editModes.customGenerators.delete(generatorId);
        state.unsavedChanges.customGenerators.delete(generatorId);
        state.validationErrors.customGenerators.delete(generatorId);
        state.optimisticLoading.customGenerators.delete(generatorId);
      }),

      /**
       * Clear all generator edit modes (useful for navigation)
       */
      clearAllGeneratorEditModes: () => set(state => {
        state.editModes.customGenerators.clear();
        state.unsavedChanges.customGenerators.clear();
        state.validationErrors.customGenerators.clear();
      }),

      // === CONTEXT MANAGEMENT ===

      /**
       * Switch between user and group contexts
       */
      setActiveContext: (type, groupId = null, groupName = null) => set(state => {
        state.activeContext = {
          type,
          groupId,
          groupName
        };
        
        // Clear data when switching contexts to prevent stale data
        state.anweisungenWissen = null;
        state.unsavedChanges.anweisungen = {};
        state.unsavedChanges.knowledge.clear();
        state.validationErrors.anweisungen = {};
        state.validationErrors.knowledge.clear();
      }),

      /**
       * Reset to user context
       */
      resetToUserContext: () => {
        get().setActiveContext('user');
      },

      // === INTEGRATIONS UI MANAGEMENT ===

      /**
       * Set current integration tab
       */
      setIntegrationTab: (tab) => set(state => {
        state.integrationsUI.currentTab = tab;
      }),

      /**
       * Set Canva subsection
       */
      setCanvaSubsection: (subsection) => set(state => {
        if (subsection === 'overview' || subsection === 'vorlagen' || subsection === 'assets') {
          state.integrationsUI.canvaSubsection = subsection;
        }
      }),

      /**
       * Open share modal
       */
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

      /**
       * Close share modal
       */
      closeShareModal: () => set(state => {
        state.integrationsUI.shareModal = {
          isOpen: false,
          content: null
        };
      }),

      /**
       * Initialize integration tab based on beta feature access
       */
      initializeIntegrationTab: (initialTab, canAccessCanva) => set(state => {
        // Normalize initial tab based on beta feature access
        let normalizedTab = initialTab;
        if (normalizedTab === 'canva' && !canAccessCanva) {
          normalizedTab = 'wolke';
        }
        state.integrationsUI.currentTab = normalizedTab;
      }),

      // === MESSAGE MANAGEMENT ===

      /**
       * Set success or error message
       */
      setMessage: (message, type = 'success') => set(state => {
        state.messages = {
          [type]: message,
          [type === 'success' ? 'error' : 'success']: '', // Clear the other type
          timestamp: Date.now()
        };
      }),

      /**
       * Clear all messages
       */
      clearMessages: () => set(state => {
        state.messages = {
          success: '',
          error: '',
          timestamp: null
        };
      }),

      // === UTILITY METHODS ===

      /**
       * Reset entire store state
       */
      reset: () => set(() => ({
        profile: null,
        anweisungenWissen: null,
        qaCollections: [],
        customGenerators: [],
        userTexts: [],
        userTemplates: [],
        memories: [],
        availableDocuments: [],
        editModes: {
          profile: false,
          avatar: false,
          anweisungen: false,
          qaCollections: false,
          customGenerators: new Map()
        },
        unsavedChanges: {
          profile: {},
          anweisungen: {},
          knowledge: new Map(),
          qaCollections: new Map(),
          customGenerators: new Map()
        },
        validationErrors: {
          profile: {},
          anweisungen: {},
          knowledge: new Map(),
          qaCollections: new Map(),
          customGenerators: new Map()
        },
        optimisticLoading: {
          avatar: false,
          displayName: false,
          betaFeatures: new Set(),
          anweisungen: false,
          knowledge: new Set(),
          customGenerators: new Set()
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

      /**
       * Get current edit state for debugging
       */
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

// Export individual selectors for performance
export const useProfileData = () => useProfileStore(state => state.profile);
export const useProfileEditMode = (section) => useProfileStore(state => state.editModes[section]);
export const useProfileUnsavedChanges = (section) => useProfileStore(state => state.unsavedChanges[section]);
export const useProfileMessages = () => useProfileStore(state => state.messages);
export const useProfileOptimisticLoading = () => useProfileStore(state => state.optimisticLoading);

// Custom Generator-specific selectors
export const useGeneratorEditMode = (generatorId) => useProfileStore(state => 
  state.editModes.customGenerators?.get(generatorId) || false
);
export const useGeneratorChanges = (generatorId) => useProfileStore(state => 
  state.unsavedChanges.customGenerators?.get(generatorId) || EMPTY_OBJECT
);
export const useGeneratorLoading = (generatorId) => useProfileStore(state => 
  state.optimisticLoading.customGenerators?.has(generatorId) || false
);
export const useGeneratorValidationErrors = (generatorId) => useProfileStore(state => 
  state.validationErrors.customGenerators?.get(generatorId) || EMPTY_OBJECT
);
export const useCustomGeneratorsList = () => useProfileStore(state => state.customGenerators);

// Integrations UI selectors
export const useIntegrationTab = () => useProfileStore(state => state.integrationsUI.currentTab);
export const useCanvaSubsection = () => useProfileStore(state => state.integrationsUI.canvaSubsection);
export const useShareModal = () => useProfileStore(state => state.integrationsUI.shareModal);
export const useIntegrationsUI = () => useProfileStore(state => state.integrationsUI);

export default useProfileStore;
