/**
 * Utility functions for the profile feature.
 */

import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from './avatarUtils';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useState, useCallback, useEffect, useRef } from 'react';
import debounce from 'lodash.debounce';
import modulePreloader from '../../../utils/modulePreloader';
import { useAnweisungenWissenUiStore } from '../../../stores/auth/anweisungenWissenUiStore';


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
    const promises = [];

    const preloadPromise = modulePreloader.intelligentPreload('/profile', userPreferences);
    promises.push(preloadPromise);

    promises.push(this.preloadComponent('ProfileInfoTab', () => import('../components/profile/ProfileInfoTab'), 'high'));
    promises.push(this.preloadComponent('LaborTab', () => import('../components/profile/LaborTab'), 'high'));

    await Promise.all([promises[0]]);

    if (user?.id) {
      this.prefetchQuery(queryClient, ['userData', user.id], () => console.log('Prefetching user data'));
      this.prefetchQuery(queryClient, ['userGroups', user.id], () => console.log('Prefetching groups'));
    }

    Promise.all(promises.slice(1)).catch(err => console.warn('Background component loading error:', err));
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
    if (tabName === activeTab || tabName === hoveredTab) return;
    
    if (user?.id) {
      switch (tabName) {
        case 'profile':
          resourceManager.prefetchQuery(queryClient, ['userData', user.id], () => console.log('Prefetching profile data'));
          break;
        case 'anweisungen':
          resourceManager.prefetchQuery(queryClient, ['anweisungenWissen', user.id], () => console.log('Prefetching anweisungen data'));
          break;
        case 'groups':
          resourceManager.prefetchQuery(queryClient, ['userGroups', user.id], () => console.log('Prefetching groups data'));
          break;
        case 'generators':
          resourceManager.prefetchQuery(queryClient, ['customGenerators', user.id], () => console.log('Prefetching custom generators data'));
          break;
        case 'texte':
          resourceManager.prefetchQuery(queryClient, ['canvaTemplates', user.id], () => console.log('Prefetching canva templates data'));
          break;
        case 'labor':
          break;
        default:
          break;
      }
    }
  }, [user, queryClient]);

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

export const useProfileData = (userId) => {
  const { user, isAuthenticated, loading } = useOptimizedAuth();
  const actualUserId = userId || user?.id;
  const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  return useQuery({
    queryKey: ['profileData', actualUserId],
    queryFn: async () => {
      if (!actualUserId) throw new Error('Kein User verfügbar');

      // Fetch profile data via backend API instead of direct Supabase access
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        // 401 bedeutet nicht eingeloggt. 404 lassen wir durchfallen.
        const msg = `Fehler beim Laden der Profildaten. Status: ${response.status}`;
        throw new Error(msg);
      }

      const data = await response.json();

      // Die API gibt { user: {...} } zurück
      const profile = data.user || data.profile || null;

      if (!profile) {
        throw new Error('Profil nicht gefunden');
      }

      return {
        display_name: profile.display_name,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email || null,
        avatar_robot_id: profile.avatar_robot_id,
        is_admin: profile.is_admin,
        username: profile.username,
        keycloak_id: profile.keycloak_id
      };
    },
    enabled: !!actualUserId,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount) => failureCount < 2
  });
};

/**
 * Hook for comprehensive profile management operations
 * Uses backend API calls instead of direct Supabase access
 */
export const useProfileManager = () => {
  const { user, updateProfile, updateAvatar } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: async (profileData) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await updateProfile(profileData);
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
    }
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarRobotId) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await updateAvatar(avatarRobotId);
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
    avatarUpdateError: updateAvatarMutation.error
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

export const useAnweisungenWissen = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  // Use the zustand store for UI state
  const { 
    setSaving, 
    setDeleting,
    setSuccess, 
    setError, 
    clearMessages, 
    reset: resetStore,
    setHasUnsavedChanges: setStoreHasUnsavedChanges
  } = useAnweisungenWissenUiStore();

  // --- React Query: Fetch Anweisungen & Wissen --- 
  const queryKey = ['anweisungenWissen', user?.id];

  const fetchAnweisungenWissenFn = async () => {
    if (!user?.id) throw new Error('Nicht eingeloggt');
    const resp = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!resp.ok) throw new Error('Fehler beim Laden');
    const json = await resp.json();
    return {
      antragPrompt: json.antragPrompt || '',
      socialPrompt: json.socialPrompt || '',
      universalPrompt: json.universalPrompt || '',
      gruenejugendPrompt: json.gruenejugendPrompt || '',
      knowledge: json.knowledge || []
    };
  };

  const query = useQuery({
      queryKey: queryKey, 
      queryFn: fetchAnweisungenWissenFn, 
      enabled: enabled && !!user?.id && isActive,
      staleTime: 5 * 60 * 1000,
      cacheTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always',
      retry: 1,
  });

  // Reset store when tab becomes inactive
  useEffect(() => {
    if (!isActive) {
      resetStore();
    }
  }, [isActive, resetStore]);


  // --- React Query: Save Mutation --- 
  const saveMutation = useMutation({
    mutationFn: async (dataToSave) => {
      // Clean knowledge entries before saving
      const cleanedKnowledge = dataToSave.knowledge.map(entry => ({
          id: typeof entry.id === 'string' && entry.id.startsWith('new-') ? undefined : entry.id,
          title: entry.title,
          content: entry.content
      }));

      const payload = {
          custom_antrag_prompt: dataToSave.customAntragPrompt,
          custom_social_prompt: dataToSave.customSocialPrompt,
          custom_universal_prompt: dataToSave.customUniversalPrompt,
          custom_gruenejugend_prompt: dataToSave.customGruenejugendPrompt,
          knowledge: cleanedKnowledge
      };

      const resp = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ message: 'Fehler beim Speichern' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }
      return await resp.json();
    },
    onMutate: () => {
      setSaving(true);
    },
    onSuccess: () => {
      setSuccess('Änderungen erfolgreich gespeichert!');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  // --- React Query: Delete Knowledge Mutation --- 
  const deleteKnowledgeMutation = useMutation({
    mutationFn: async (entryId) => {
      if (typeof entryId === 'string' && entryId.startsWith('new-')) {
          // This should not happen if called correctly, but as a safeguard
          return; 
      }
      
      const resp = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen/${entryId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Fehler beim Löschen');
      }
      return entryId;
    },
    onMutate: (entryId) => {
      setDeleting(true, entryId);
    },
    onSuccess: () => {
      setSuccess('Wissenseintrag gelöscht.');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setError(error.message);
    }
  });

   return {
      // The main data query object
      query,
      // Mutation functions
      saveChanges: saveMutation.mutate,
      deleteKnowledgeEntry: deleteKnowledgeMutation.mutate,
      // Constants
      MAX_KNOWLEDGE_ENTRIES
    };
};
// === END PERSONAL INSTRUCTIONS & KNOWLEDGE === 

// === Q&A COLLECTIONS MANAGEMENT ===

export const useQACollections = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- React Query: Fetch Q&A Collections --- 
  const queryKey = ['qaCollections', user?.id];

  const fetchQACollectionsFn = async () => {
    if (!user?.id) throw new Error('Nicht eingeloggt');
    const resp = await fetch(`${AUTH_BASE_URL}/auth/qa-collections`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!resp.ok) throw new Error('Fehler beim Laden der Q&A-Sammlungen');
    const json = await resp.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch Q&A collections');
    }
    
    return json.collections || [];
  };

  const query = useQuery({
    queryKey: queryKey, 
    queryFn: fetchQACollectionsFn, 
    enabled: enabled && !!user?.id && isActive,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  // --- React Query: Create Collection Mutation --- 
  const createCollectionMutation = useMutation({
    mutationFn: async (collectionData) => {
      if (!user?.id) throw new Error('Nicht eingeloggt');
      
      const resp = await fetch(`${AUTH_BASE_URL}/auth/qa-collections`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: collectionData.name,
          description: collectionData.description,
          custom_prompt: collectionData.custom_prompt,
          documents: collectionData.documents
        })
      });
      
      if (!resp.ok) throw new Error('Fehler beim Erstellen der Q&A-Sammlung');
      const json = await resp.json();
      
      if (!json.success) {
        throw new Error(json.message || 'Failed to create Q&A collection');
      }
      
      return json.collection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  // --- React Query: Update Collection Mutation --- 
  const updateCollectionMutation = useMutation({
    mutationFn: async ({ collectionId, collectionData }) => {
      if (!user?.id) throw new Error('Nicht eingeloggt');
      
      const resp = await fetch(`${AUTH_BASE_URL}/auth/qa-collections/${collectionId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: collectionData.name,
          description: collectionData.description,
          custom_prompt: collectionData.custom_prompt,
          documents: collectionData.documents
        })
      });
      
      if (!resp.ok) throw new Error('Fehler beim Aktualisieren der Q&A-Sammlung');
      const json = await resp.json();
      
      if (!json.success) {
        throw new Error(json.message || 'Failed to update Q&A collection');
      }
      
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  // --- React Query: Delete Collection Mutation --- 
  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId) => {
      if (!user?.id) throw new Error('Nicht eingeloggt');
      
      const resp = await fetch(`${AUTH_BASE_URL}/auth/qa-collections/${collectionId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!resp.ok) throw new Error('Fehler beim Löschen der Q&A-Sammlung');
      const json = await resp.json();
      
      if (!json.success) {
        throw new Error(json.message || 'Failed to delete Q&A collection');
      }
      
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  // Fetch available documents for Q&A creation
  const fetchAvailableDocuments = async () => {
    if (!user?.id) throw new Error('Nicht eingeloggt');
    
    const resp = await fetch(`${AUTH_BASE_URL}/documents/user`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!resp.ok) throw new Error('Fehler beim Laden der Dokumente');
    const json = await resp.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch documents');
    }

    // Filter only completed documents
    const completedDocuments = (json.data || []).filter(doc => doc.status === 'completed');
    return completedDocuments;
  };

  // Helper functions
  const getQACollection = (collectionId) => {
    const collections = query.data || [];
    return collections.find(c => c.id === collectionId);
  };

  return {
    // The main data query object
    query,
    // Mutation functions
    createQACollection: createCollectionMutation.mutate,
    updateQACollection: (collectionId, collectionData) => 
      updateCollectionMutation.mutate({ collectionId, collectionData }),
    deleteQACollection: deleteCollectionMutation.mutate,
    // Helper functions
    fetchAvailableDocuments,
    getQACollection,
    // Loading states
    isCreating: createCollectionMutation.isPending,
    isUpdating: updateCollectionMutation.isPending,
    isDeleting: deleteCollectionMutation.isPending,
  };
};

// === END Q&A COLLECTIONS MANAGEMENT ===