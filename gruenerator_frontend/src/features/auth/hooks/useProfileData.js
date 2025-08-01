/**
 * Centralized hook for all profile-related data operations
 * Uses React Query with the profileApiService for consistent caching and state management
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { profileApiService } from '../services/profileApiService';

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

  return useQuery({
    queryKey: QUERY_KEYS.profile(actualUserId),
    queryFn: profileApiService.getProfile,
    enabled: !!actualUserId,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount) => failureCount < 2
  });
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
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    gcTime: 30 * 60 * 1000, // Fixed: was cacheTime (React Query v5)
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Fixed: was 'always' (React Query v5)
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  return {
    query,
    saveChanges: saveMutation.mutateAsync,
    deleteKnowledgeEntry: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    saveError: saveMutation.error,
    deleteError: deleteMutation.error,
    MAX_KNOWLEDGE_ENTRIES: 3
  };
};

// === Q&A COLLECTIONS ===
export const useQACollections = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

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

  return useQuery({
    queryKey: QUERY_KEYS.availableDocuments(user?.id),
    queryFn: profileApiService.getAvailableDocuments,
    enabled: enabled && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000 // Increased from 15 to 30 minutes
  });
};

// === MEMORY (MEM0RY) ===
export const useMemories = ({ isActive, enabled = true } = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

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