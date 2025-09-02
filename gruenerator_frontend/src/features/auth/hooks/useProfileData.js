/**
 * Centralized hook for all profile-related data operations
 * Uses React Query with the profileApiService for consistent caching and state management
 * Syncs with profileStore for UI state management and optimistic updates
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { profileApiService } from '../services/profileApiService';
import { useProfileStore } from '../../../stores/profileStore';

// Query keys for consistent cache management
export const QUERY_KEYS = {
  profile: (userId) => ['profileData', userId],
  bundledProfile: (userId, options) => ['bundledProfileData', userId, options],
  anweisungenWissen: (userId) => ['anweisungenWissen', userId],
  qaCollections: (userId) => ['qaCollections', userId],
  customGenerators: (userId) => ['customGenerators', userId],
  generatorDocuments: (generatorId) => ['generatorDocuments', generatorId],
  userTexts: (userId) => ['userTexts', userId],
  userTemplates: (userId) => ['userTemplates', userId],
  availableDocuments: (userId) => ['availableDocuments', userId],
  memories: (userId) => ['memories', userId]
};

// === PROFILE DATA ===
export const useProfile = (userId) => {
  const { user } = useOptimizedAuth();
  const actualUserId = userId || user?.id;
  const syncProfile = useProfileStore(state => state.syncProfile);

  const query = useQuery({
    queryKey: QUERY_KEYS.profile(actualUserId),
    queryFn: profileApiService.getProfile,
    enabled: !!actualUserId,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount) => failureCount < 2,
    // Prevent automatic refetch that could interfere with avatar updates
    refetchInterval: false
  });

  // Sync React Query data with profileStore
  useEffect(() => {
    if (query.data) {
      console.log(`[Profile Hook] 📄 Profile data received for user ${actualUserId}: avatar_robot_id=${query.data.avatar_robot_id}`);
      syncProfile(query.data);
    }
  }, [query.data, syncProfile, actualUserId]);

  return query;
};

// === BUNDLED PROFILE DATA ===
export const useBundledProfileData = (options = {}) => {
  const { user } = useOptimizedAuth();
  const userId = user?.id;
  
  const defaultOptions = {
    includeAnweisungen: true,
    includeQACollections: true,
    includeCustomGenerators: true,
    includeUserTexts: false,
    includeUserTemplates: false,
    includeMemories: false
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return useQuery({
    queryKey: QUERY_KEYS.bundledProfile(userId, mergedOptions),
    queryFn: () => profileApiService.getBundledProfileData(mergedOptions),
    enabled: !!userId,
    staleTime: 15 * 60 * 1000, // 15 minutes cache
    cacheTime: 30 * 60 * 1000, // 30 minutes in memory
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount) => failureCount < 2
  });
};

// === ANWEISUNGEN & WISSEN ===
export const useAnweisungenWissen = ({ 
  isActive, 
  enabled = true,
  context = 'user',     // 'user' | 'group'
  groupId = null        // required when context = 'group'
} = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncAnweisungenWissen = useProfileStore(state => state.syncAnweisungenWissen);
  const setActiveContext = useProfileStore(state => state.setActiveContext);

  // Context-aware query key
  const queryKey = context === 'group' 
    ? ['groupAnweisungenWissen', groupId]
    : QUERY_KEYS.anweisungenWissen(user?.id);

  // Context-aware query function
  const queryFn = context === 'group'
    ? () => profileApiService.getAnweisungenWissen(context, groupId)
    : profileApiService.getAnweisungenWissen;

  const query = useQuery({
    queryKey,
    queryFn,
    enabled: enabled && !!user?.id && isActive && (context === 'user' || !!groupId),
    staleTime: 5 * 60 * 1000, // Reduced from 15 to 5 minutes for better freshness
    gcTime: 15 * 60 * 1000, // Reduced from 30 to 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Always refetch on mount for fresh data
    retry: 1
  });

  const saveMutation = useMutation({
    mutationFn: (data) => profileApiService.saveAnweisungenWissen(data, context, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId) => profileApiService.deleteKnowledgeEntry(entryId, context, groupId),
    onMutate: async (entryId) => {
      // Cancel outgoing refetches to avoid optimistic update conflicts
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(queryKey);
      
      // Optimistically update the cache by removing the deleted entry
      queryClient.setQueryData(queryKey, old => {
        if (!old) return old;
        return {
          ...old,
          knowledge: (old.knowledge || []).filter(k => k.id !== entryId)
        };
      });
      
      return { previousData };
    },
    onError: (err, entryId, context) => {
      // Rollback optimistic update on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after mutation to ensure consistency
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, exact: true });
    }
  });

  // Sync with profileStore
  useEffect(() => {
    // Update active context in store
    if (context === 'group' && groupId) {
      setActiveContext('group', groupId);
    } else {
      setActiveContext('user');
    }
  }, [context, groupId, setActiveContext]);

  useEffect(() => {
    // Sync query data to store
    if (query.data) {
      syncAnweisungenWissen(query.data);
    }
  }, [query.data, syncAnweisungenWissen]);

  return {
    query,
    saveChanges: saveMutation.mutateAsync,
    deleteKnowledgeEntry: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    deletingKnowledgeId: deleteMutation.isPending ? deleteMutation.variables : null, // Track which entry is being deleted
    saveError: saveMutation.error,
    deleteError: deleteMutation.error,
    MAX_KNOWLEDGE_ENTRIES: 3
  };
};

// === Q&A COLLECTIONS ===
export const useQACollections = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncQACollections = useProfileStore(state => state.syncQACollections);

  const query = useQuery({
    queryKey: QUERY_KEYS.qaCollections(user?.id),
    queryFn: profileApiService.getQACollections,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1
  });

  const createMutation = useMutation({
    mutationFn: profileApiService.createQACollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.qaCollections(user?.id) });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ collectionId, collectionData }) => 
      profileApiService.updateQACollection(collectionId, collectionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.qaCollections(user?.id) });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteQACollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.qaCollections(user?.id) });
    }
  });

  const getQACollection = (collectionId) => {
    const collections = query.data || [];
    return collections.find(c => c.id === collectionId);
  };

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncQACollections(query.data);
    }
  }, [query.data, syncQACollections]);

  return {
    query,
    createQACollection: createMutation.mutateAsync,
    updateQACollection: (collectionId, collectionData) => 
      updateMutation.mutateAsync({ collectionId, collectionData }),
    deleteQACollection: deleteMutation.mutateAsync,
    fetchAvailableDocuments: profileApiService.getAvailableDocuments,
    getQACollection,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error
  };
};

// === CUSTOM GENERATORS ===
export const useCustomGenerators = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncCustomGenerators = useProfileStore(state => state.syncCustomGenerators);

  const query = useQuery({
    queryKey: QUERY_KEYS.customGenerators(user?.id),
    queryFn: profileApiService.getCustomGenerators,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteCustomGenerator,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customGenerators(user?.id) });
    }
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncCustomGenerators(query.data);
    }
  }, [query.data, syncCustomGenerators]);

  return {
    query,
    deleteGenerator: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error
  };
};

// === GENERATOR DOCUMENTS ===
export const useGeneratorDocuments = (generatorId) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEYS.generatorDocuments(generatorId),
    queryFn: () => profileApiService.getGeneratorDocuments(generatorId),
    enabled: !!generatorId && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000 // Increased from 15 to 30 minutes
  });

  const addDocumentsMutation = useMutation({
    mutationFn: (documentIds) => 
      profileApiService.addDocumentsToGenerator(generatorId, documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.generatorDocuments(generatorId) });
    }
  });

  const removeDocumentMutation = useMutation({
    mutationFn: (documentId) => 
      profileApiService.removeDocumentFromGenerator(generatorId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.generatorDocuments(generatorId) });
    }
  });

  return {
    query,
    addDocuments: addDocumentsMutation.mutateAsync,
    removeDocument: removeDocumentMutation.mutateAsync,
    isAddingDocuments: addDocumentsMutation.isPending,
    isRemovingDocument: removeDocumentMutation.isPending,
    addError: addDocumentsMutation.error,
    removeError: removeDocumentMutation.error
  };
};

// === USER TEXTS ===
export const useUserTexts = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncUserTexts = useProfileStore(state => state.syncUserTexts);

  const query = useQuery({
    queryKey: QUERY_KEYS.userTexts(user?.id),
    queryFn: profileApiService.getUserTexts,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ textId, newTitle }) => 
      profileApiService.updateTextTitle(textId, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteText,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    }
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncUserTexts(query.data);
    }
  }, [query.data, syncUserTexts]);

  return {
    query,
    updateTextTitle: (textId, newTitle) => 
      updateTitleMutation.mutateAsync({ textId, newTitle }),
    deleteText: deleteMutation.mutateAsync,
    isUpdatingTitle: updateTitleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    updateError: updateTitleMutation.error,
    deleteError: deleteMutation.error
  };
};

// === USER TEMPLATES ===
export const useUserTemplates = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncUserTemplates = useProfileStore(state => state.syncUserTemplates);

  const query = useQuery({
    queryKey: QUERY_KEYS.userTemplates(user?.id),
    queryFn: profileApiService.getUserTemplates,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ templateId, newTitle }) => 
      profileApiService.updateTemplateTitle(templateId, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    }
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncUserTemplates(query.data);
    }
  }, [query.data, syncUserTemplates]);

  return {
    query,
    updateTemplateTitle: (templateId, newTitle) => 
      updateTitleMutation.mutateAsync({ templateId, newTitle }),
    deleteTemplate: deleteMutation.mutateAsync,
    isUpdatingTitle: updateTitleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    updateError: updateTitleMutation.error,
    deleteError: deleteMutation.error
  };
};

// === AVAILABLE DOCUMENTS ===
export const useAvailableDocuments = ({ enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const syncAvailableDocuments = useProfileStore(state => state.syncAvailableDocuments);

  const query = useQuery({
    queryKey: QUERY_KEYS.availableDocuments(user?.id),
    queryFn: profileApiService.getAvailableDocuments,
    enabled: enabled && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000 // Increased from 15 to 30 minutes
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncAvailableDocuments(query.data);
    }
  }, [query.data, syncAvailableDocuments]);

  return query;
};

// === MEMORY (MEM0RY) ===
export const useMemories = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncMemories = useProfileStore(state => state.syncMemories);

  const query = useQuery({
    queryKey: QUERY_KEYS.memories(user?.id),
    queryFn: () => profileApiService.getMemories(user?.id),
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false
  });

  const addMemoryMutation = useMutation({
    mutationFn: ({ text, topic }) => profileApiService.addMemory(text, topic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.memories(user?.id) });
    }
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: profileApiService.deleteMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.memories(user?.id) });
    }
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncMemories(query.data);
    }
  }, [query.data, syncMemories]);

  return {
    query,
    addMemory: (text, topic = '') => addMemoryMutation.mutateAsync({ text, topic }),
    deleteMemory: deleteMemoryMutation.mutateAsync,
    isAddingMemory: addMemoryMutation.isPending,
    isDeletingMemory: deleteMemoryMutation.isPending,
    addError: addMemoryMutation.error,
    deleteError: deleteMemoryMutation.error
  };
};

// === LEGACY COMPATIBILITY ===
// Keep original exports for backward compatibility during transition
export { useProfile as useProfileData };