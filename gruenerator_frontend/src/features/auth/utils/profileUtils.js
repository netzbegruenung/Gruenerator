/**
 * Utility functions for the profile feature.
 * Updated to use centralized hooks from useProfileData.js
 */

import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from './avatarUtils';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useState, useCallback, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import modulePreloader from '../../../utils/modulePreloader';
import { useInstructionsUiStore } from '../../../stores/auth/instructionsUiStore';
import { profileApiService } from '../services/profileApiService';

// Import centralized hooks
import { 
  useProfile as useProfileDataNew, 
  useAnweisungenWissen as useAnweisungenWissenNew,
  useQACollections as useQACollectionsNew 
} from '../hooks/useProfileData';


/**
 * Get initials from first name, last name, or email
 * @param {string} fname - First name
 * @param {string} lname - Last name  
 * @param {string} mail - Email address
 * @returns {string} Initials (2 characters)
 */
export const getInitials = (fname, lname, mail) => {
  if (fname && lname) {
    return (fname.charAt(0) + lname.charAt(0)).toUpperCase();
  } else if (fname) {
    return fname.substring(0, 2).toUpperCase();
  } else if (lname) {
    return lname.substring(0, 2).toUpperCase();
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
  const { avatar_robot_id, first_name, last_name, email } = profile || {};
  
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
    initials: getInitials(first_name, last_name, email || 'User')
  };
};

// === RESOURCE MANAGEMENT ===

/**
 * Advanced Resource Manager for Profile Components
 * Extracted from ProfilePage.jsx for centralization
 */
class ProfileResourceManager {
  constructor() {
    this.authBaseUrl = null;
    this.loadingPromise = null;
    this.componentPromises = new Map();
    this.queryPrefetches = new Map();
  }

  async getAuthBaseUrl() {
    if (this.authBaseUrl) return this.authBaseUrl;
    
    this.authBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    return this.authBaseUrl;
  }


  preloadComponent(name, importFn, priority = 'normal') {
    if (this.componentPromises.has(name)) {
      return this.componentPromises.get(name);
    }

    const loadComponent = () => {
      const promise = importFn().catch(err => {
        console.warn(`Failed to preload component ${name}:`, err);
        return null;
      });
      this.componentPromises.set(name, promise);
      return promise;
    };

    if (priority === 'high') {
      return loadComponent();
    } else if (priority === 'normal') {
      return new Promise(resolve => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(() => resolve(loadComponent()), { timeout: 1000 });
        } else {
          setTimeout(() => resolve(loadComponent()), 100);
        }
      });
    } else {
      return new Promise(resolve => {
        setTimeout(() => resolve(loadComponent()), 2000);
      });
    }
  }

  prefetchQuery(queryClient, queryKey, queryFn = () => null, options = {}) {
    const key = JSON.stringify(queryKey);
    if (this.queryPrefetches.has(key)) return;

    this.queryPrefetches.set(key, true);

    // Wrap the original queryFn so that it never returns undefined
    const safeQueryFn = async () => {
      try {
        const result = await Promise.resolve(queryFn());
        return typeof result === 'undefined' ? null : result;
      } catch (err) {
        // Log and gracefully fall back – the prefetched data is optional
        console.warn('Prefetch query failed:', err);
        return null;
      }
    };

    queryClient.prefetchQuery({
      queryKey,
      queryFn: safeQueryFn,
      staleTime: 5 * 60 * 1000,
      ...options
    });
  }

  async initializeResources(user, queryClient, userPreferences = {}) {
    // Reduced aggressive preloading to minimize server load
    // Only preload essential components
    const promises = [];

    // Only preload the most critical component
    promises.push(this.preloadComponent('ProfileInfoTab', () => import('../components/profile/ProfileInfoTab'), 'high'));

    // Removed aggressive query prefetching - data will load when needed
    Promise.all(promises).catch(err => console.warn('Background component loading error:', err));
  }
}

// Global resource manager instance
const resourceManager = new ProfileResourceManager();

/**
 * Hook for managing profile resources and component loading
 * Extracted from ProfilePage.jsx
 */
export const useProfileResourceManager = () => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const [resourcesError, setResourcesError] = useState('');
  const [isLoadingResources, setIsLoadingResources] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadResources = async () => {
      if (!user) return;

      try {
        setResourcesError('');
        setIsLoadingResources(true);

        const userPreferences = {
          betaFeatures: user?.user_metadata?.beta_features || {},
          frequentlyUsed: []
        };
        await resourceManager.initializeResources(user, queryClient, userPreferences);

        if (isMounted) {
          setIsLoadingResources(false);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Resource loading error:', error);
          setResourcesError('Problem beim Laden der Ressourcen.');
          setIsLoadingResources(false);
        }
      }
    };

    loadResources();
    return () => { isMounted = false; };
  }, [user, queryClient]);

  const handleTabHover = useCallback((tabName, activeTab, hoveredTab) => {
    // Removed aggressive prefetching to reduce server load
    // Data will be loaded only when tabs are actually clicked/activated
    return;
  }, []);

  return {
    resourcesError,
    isLoadingResources,
    handleTabHover,
    resourceManager
  };
};


// === PROFILE DATA MANAGEMENT ===

/**
 * Initialize profile form fields with safe fallbacks
 * @param {object} profile - Profile data from API
 * @param {object} user - User data from auth
 * @returns {object} Initialized form values
 */
export const initializeProfileFormFields = (profile, user) => {
  const safeName = profile?.display_name || 
                   (profile?.first_name && profile?.last_name ? 
                    `${profile.first_name} ${profile.last_name}`.trim() : 
                    user?.email || user?.username || 'User');
  
  // Prioritize auth user email if profile email is empty/null
  const syncedEmail = (profile?.email && profile.email.trim()) ? 
                      profile.email : 
                      (user?.email || '');
  
  return {
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    displayName: safeName,
    email: syncedEmail
  };
};

// Legacy compatibility wrapper
export const useProfileData = (userId) => {
  return useProfileDataNew(userId);
};

/**
 * Hook for comprehensive profile management operations
 * Uses backend API calls instead of direct Supabase access
 */
export const useProfileManager = () => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: async (profileData) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateProfile(profileData);
    },
    onSuccess: (updatedProfile) => {
      if (user?.id && updatedProfile) {
        // Use setQueryData instead of invalidateQueries to prevent refetch loops
        queryClient.setQueryData(['profileData', user.id], (oldData) => ({
          ...oldData,
          ...updatedProfile
        }));
      }
    },
    onError: (error) => {
      console.error('Profile update failed:', error);
    },
    // Add retry configuration
    retry: 1,
    retryDelay: 1000
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarRobotId) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateAvatar(avatarRobotId);
    },
    onSuccess: (updatedProfile) => {
      if (user?.id && updatedProfile) {
        // Use setQueryData instead of invalidateQueries to prevent refetch loops
        queryClient.setQueryData(['profileData', user.id], (oldData) => ({
          ...oldData,
          ...updatedProfile
        }));
      }
    },
    onError: (error) => {
      console.error('Avatar update failed:', error);
    }
  });

  return {
    updateProfile: updateProfileMutation.mutate,
    updateAvatar: updateAvatarMutation.mutate,
    isUpdatingProfile: updateProfileMutation.isPending,
    isUpdatingAvatar: updateAvatarMutation.isPending,
    profileUpdateError: updateProfileMutation.error,
    avatarUpdateError: updateAvatarMutation.error,
    resetProfileMutation: () => updateProfileMutation.reset()
  };
};

/**
 * Auto-resize textarea to fit content
 * @param {HTMLTextAreaElement} element - The textarea element
 */
export const autoResizeTextarea = (element) => {
  if (!element) return;
  
  element.style.height = 'auto';
  element.style.height = (element.scrollHeight + 2) + 'px';
};

// === PERSONAL INSTRUCTIONS & KNOWLEDGE ===

const MAX_KNOWLEDGE_ENTRIES = 3;
const MAX_CONTENT_LENGTH = 1000;

// Helper for deep comparison (simple version)
const deepEqual = (obj1, obj2) => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

// Helper to prepare knowledge entry for comparison/saving (removes temporary flags)
const cleanKnowledgeEntry = (entry) => {
    if (!entry) return { title: '', content: '' }; // Return empty structure for comparison
    // Ensure defined values for comparison, treat null/undefined as empty string
    // Keep the id if it's not temporary, needed for updates/deletes
    const cleaned = {
      id: (typeof entry.id === 'string' && entry.id.startsWith('new-')) ? undefined : entry.id,
      title: entry.title?.trim() || '',
      content: entry.content?.trim() || ''
    };
    return cleaned;
};

// Legacy compatibility wrapper with UI store integration
export const useAnweisungenWissen = ({ isActive, enabled = true } = {}) => {
  
  // Use the zustand store for UI state (maintains existing behavior)
  const { 
    isSaving: uiIsSaving,
    isDeleting: uiIsDeleting,
    deletingKnowledgeId,
    setSaving, 
    setDeleting,
    setSuccess, 
    setError, 
    clearMessages, 
    reset: resetStore,
    setHasUnsavedChanges: setStoreHasUnsavedChanges
  } = useInstructionsUiStore();

  // Reset store when tab becomes inactive
  useEffect(() => {
    if (!isActive) {
      resetStore();
    }
  }, [isActive, resetStore]);

  // Use the new centralized hook
  const hookResult = useAnweisungenWissenNew({ isActive, enabled });

  // Wrap mutations to update UI store
  const saveChanges = useCallback((data) => {
    setSaving(true);
    return hookResult.saveChanges(data)
      .then((result) => {
        setSuccess('Änderungen erfolgreich gespeichert!');
        return result;
      })
      .catch((error) => {
        setError(error.message);
        throw error;
      });
  }, [hookResult.saveChanges, setSaving, setSuccess, setError]);

  const deleteKnowledgeEntry = useCallback((entryId) => {
    setDeleting(true, entryId);
    return hookResult.deleteKnowledgeEntry(entryId)
      .then((result) => {
        setSuccess('Wissenseintrag gelöscht.');
        return result;
      })
      .catch((error) => {
        setError(error.message);
        throw error;
      });
  }, [hookResult.deleteKnowledgeEntry, setDeleting, setSuccess, setError]);

  return {
    ...hookResult,
    saveChanges,
    deleteKnowledgeEntry,
    isSaving: uiIsSaving,
    isDeleting: uiIsDeleting,
    deletingKnowledgeId
  };
};
// === END PERSONAL INSTRUCTIONS & KNOWLEDGE === 

// === Q&A COLLECTIONS MANAGEMENT ===

// Legacy compatibility wrapper
export const useQACollections = ({ isActive, enabled = true } = {}) => {
  return useQACollectionsNew({ isActive, enabled });
};

// === END Q&A COLLECTIONS MANAGEMENT ===