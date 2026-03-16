/**
 * Centralized hook for all profile-related data operations
 * Uses React Query with the profileApiService for consistent caching and state management
 * Syncs with profileStore for UI state management and optimistic updates
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfileStore } from '../../../stores/profileStore';
import {
  type AnweisungenSaveData,
  type AnweisungenWissen,
  type BundleOptions,
  type CustomGenerator,
  type CustomGeneratorData,
  type Document,
  type Memory,
  type Profile,
  type ProfileBundle,
  type QACollection,
  type QACollectionData,
  type SavedText,
  type UserTemplate,
  type UserTemplateUpdateData,
  profileApiService,
} from '../services/profileApiService';

// === OPTION TYPES ===

interface TabHookOptions {
  isActive?: boolean;
  enabled?: boolean;
}

interface EnabledOnlyOptions {
  enabled?: boolean;
}

// Query keys for consistent cache management
export const QUERY_KEYS = {
  profile: (userId: string | undefined) => ['profileData', userId] as const,
  bundledProfile: (userId: string | undefined, options: BundleOptions) =>
    ['bundledProfileData', userId, options] as const,
  anweisungenWissen: (userId: string | undefined) => ['anweisungenWissen', userId] as const,
  notebookCollections: (userId: string | undefined) => ['notebookCollections', userId] as const,
  customGenerators: (userId: string | undefined) => ['customGenerators', userId] as const,
  savedGenerators: (userId: string | undefined) => ['savedGenerators', userId] as const,
  generatorDocuments: (generatorId: string | undefined) =>
    ['generatorDocuments', generatorId] as const,
  userTexts: (userId: string | undefined) => ['userTexts', userId] as const,
  userTemplates: (userId: string | undefined) => ['userTemplates', userId] as const,
  availableDocuments: (userId: string | undefined) => ['availableDocuments', userId] as const,
  memories: (userId: string | undefined) => ['memories', userId] as const,
};

// === PROFILE DATA ===
export const useProfile = (userId?: string) => {
  const { user } = useOptimizedAuth();
  const actualUserId = userId || user?.id;
  const syncProfile = useProfileStore((state) => state.syncProfile);

  const query = useQuery<Profile, Error>({
    queryKey: QUERY_KEYS.profile(actualUserId),
    queryFn: profileApiService.getProfile,
    enabled: !!actualUserId,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount: number) => failureCount < 2,
    // Prevent automatic refetch that could interfere with avatar updates
    refetchInterval: false,
  });

  // Sync React Query data with profileStore
  useEffect(() => {
    if (query.data) {
      syncProfile(query.data);
    }
  }, [query.data, syncProfile, actualUserId]);

  return query;
};

// === BUNDLED PROFILE DATA ===
export const useBundledProfileData = (options: BundleOptions = {}) => {
  const { user } = useOptimizedAuth();
  const userId = user?.id;

  const defaultOptions: Required<BundleOptions> = {
    includeAnweisungen: true,
    includeNotebookCollections: true,
    includeCustomGenerators: true,
    includeUserTexts: false,
    includeUserTemplates: false,
    includeMemories: false,
  };

  const mergedOptions: Required<BundleOptions> = { ...defaultOptions, ...options };

  return useQuery<ProfileBundle, Error>({
    queryKey: QUERY_KEYS.bundledProfile(userId, mergedOptions),
    queryFn: () => profileApiService.getBundledProfileData(mergedOptions),
    enabled: !!userId,
    staleTime: 15 * 60 * 1000, // 15 minutes cache
    cacheTime: 30 * 60 * 1000, // 30 minutes in memory
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount: number) => failureCount < 2,
  });
};

// === ANWEISUNGEN & WISSEN ===
export const useAnweisungenWissen = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncAnweisungenWissen = useProfileStore((state) => state.syncAnweisungenWissen);

  const queryKey = QUERY_KEYS.anweisungenWissen(user?.id);

  const query = useQuery<AnweisungenWissen, Error>({
    queryKey,
    queryFn: profileApiService.getAnweisungenWissen,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (data: AnweisungenSaveData) => profileApiService.saveAnweisungenWissen(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string | number) => profileApiService.deleteKnowledgeEntry(entryId),
    onMutate: async (entryId: string | number) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<AnweisungenWissen>(queryKey);

      queryClient.setQueryData<AnweisungenWissen>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          knowledge: (old.knowledge || []).filter((k) => k.id !== entryId),
        };
      });

      return { previousData };
    },
    onError: (
      _err: Error,
      _entryId: string | number,
      ctx: { previousData: AnweisungenWissen | undefined } | undefined
    ) => {
      if (ctx?.previousData) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, exact: true });
    },
  });

  useEffect(() => {
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
    deletingKnowledgeId: deleteMutation.isPending ? deleteMutation.variables : null,
    saveError: saveMutation.error,
    deleteError: deleteMutation.error,
    MAX_KNOWLEDGE_ENTRIES: 3,
  };
};

// === Q&A COLLECTIONS ===
export const useNotebookCollections = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncNotebookCollections = useProfileStore((state) => state.syncNotebookCollections);

  const query = useQuery<QACollection[], Error>({
    queryKey: QUERY_KEYS.notebookCollections(user?.id),
    queryFn: profileApiService.getNotebookCollections,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: profileApiService.createQACollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      collectionId,
      collectionData,
    }: {
      collectionId: string | number;
      collectionData: QACollectionData;
    }) => profileApiService.updateQACollection(collectionId, collectionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteQACollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (collectionId: string | number) => profileApiService.syncQACollection(collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
    },
  });

  const getQACollection = (collectionId: string | number): QACollection | undefined => {
    const collections = query.data || [];
    return collections.find((c) => c.id === collectionId);
  };

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncNotebookCollections(query.data);
    }
  }, [query.data, syncNotebookCollections]);

  return {
    query,
    createQACollection: createMutation.mutateAsync,
    updateQACollection: (collectionId: string | number, collectionData: QACollectionData) =>
      updateMutation.mutateAsync({ collectionId, collectionData }),
    deleteQACollection: deleteMutation.mutateAsync,
    syncQACollection: syncMutation.mutateAsync,
    fetchAvailableDocuments: profileApiService.getAvailableDocuments,
    getQACollection,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSyncing: syncMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
    syncError: syncMutation.error,
  };
};

// === CUSTOM GENERATORS ===
// Split responsibilities for Custom Generators
// - useCustomGeneratorsData: Fetches via React Query and syncs to Zustand (server state owner)
// - useCustomGeneratorsMutations: Provides update/delete mutations only (no fetching/syncing)

export const useCustomGeneratorsData = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const syncCustomGenerators = useProfileStore((state) => state.syncCustomGenerators);
  const currentGenerators = useProfileStore((state) => state.customGenerators);

  const shouldFetch = enabled && !!user?.id && isActive;

  const query = useQuery<CustomGenerator[], Error>({
    queryKey: QUERY_KEYS.customGenerators(user?.id),
    queryFn: profileApiService.getCustomGenerators,
    enabled: shouldFetch,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  // Shallow compare by id+updated_at (or basic length/id fallback) to avoid redundant syncs
  const areGeneratorsEqual = (
    a: CustomGenerator[] | null | undefined,
    b: CustomGenerator[] | null | undefined
  ): boolean => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ga = a[i];
      const gb = b[i];
      // If order changes, this will detect difference; that's fine because state should reflect server order
      if (String(ga.id) !== String(gb.id)) return false;
      // Prefer updated_at if present; otherwise a few stable fields
      const aUpdated =
        (ga as Record<string, unknown>).updated_at ||
        (ga as Record<string, unknown>).updatedAt ||
        (ga as Record<string, unknown>).updated ||
        null;
      const bUpdated =
        (gb as Record<string, unknown>).updated_at ||
        (gb as Record<string, unknown>).updatedAt ||
        (gb as Record<string, unknown>).updated ||
        null;
      if (aUpdated !== bUpdated) return false;
      // Minimal fallback to catch common edits
      if (
        ((ga as Record<string, unknown>).title || ga.name) !==
        ((gb as Record<string, unknown>).title || gb.name)
      )
        return false;
      if ((ga as Record<string, unknown>).slug !== (gb as Record<string, unknown>).slug)
        return false;
    }
    return true;
  };

  // Sync with profileStore only when data meaningfully changes
  useEffect(() => {
    if (!query.data) return;
    if (!areGeneratorsEqual(currentGenerators, query.data)) {
      syncCustomGenerators(query.data);
    }
  }, [query.data, currentGenerators, syncCustomGenerators]);

  return {
    query,
  };
};

export const useCustomGeneratorsMutations = () => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({
      generatorId,
      updateData,
    }: {
      generatorId: string | number;
      updateData: CustomGeneratorData;
    }) => profileApiService.updateCustomGenerator(generatorId, updateData),
    onMutate: async ({
      generatorId,
      updateData,
    }: {
      generatorId: string | number;
      updateData: CustomGeneratorData;
    }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.customGenerators(user?.id) });
      const previousGenerators = queryClient.getQueryData<CustomGenerator[]>(
        QUERY_KEYS.customGenerators(user?.id)
      );
      queryClient.setQueryData<CustomGenerator[]>(QUERY_KEYS.customGenerators(user?.id), (old) => {
        if (!old) return old;
        return old.map((generator) =>
          String(generator.id) === String(generatorId) ? { ...generator, ...updateData } : generator
        );
      });
      return { previousGenerators, generatorId };
    },
    onSuccess: (updatedGenerator: CustomGenerator, { generatorId }) => {
      queryClient.setQueryData<CustomGenerator[]>(QUERY_KEYS.customGenerators(user?.id), (old) => {
        if (!old) return old;
        return old.map((generator) =>
          String(generator.id) === String(generatorId) ? updatedGenerator : generator
        );
      });
    },
    onError: (
      _error: Error,
      _variables: { generatorId: string | number; updateData: CustomGeneratorData },
      context: { previousGenerators: CustomGenerator[] | undefined } | undefined
    ) => {
      if (context?.previousGenerators) {
        queryClient.setQueryData(QUERY_KEYS.customGenerators(user?.id), context.previousGenerators);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteCustomGenerator,
    onMutate: async (generatorId: string | number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.customGenerators(user?.id) });
      const previousGenerators = queryClient.getQueryData<CustomGenerator[]>(
        QUERY_KEYS.customGenerators(user?.id)
      );
      queryClient.setQueryData<CustomGenerator[]>(QUERY_KEYS.customGenerators(user?.id), (old) => {
        if (!old) return old;
        return old.filter((generator) => String(generator.id) !== String(generatorId));
      });
      return { previousGenerators, generatorId };
    },
    onError: (
      _error: Error,
      _variables: string | number,
      context: { previousGenerators: CustomGenerator[] | undefined } | undefined
    ) => {
      if (context?.previousGenerators) {
        queryClient.setQueryData(QUERY_KEYS.customGenerators(user?.id), context.previousGenerators);
      }
    },
  });

  return {
    updateGenerator: (generatorId: string | number, updateData: CustomGeneratorData) =>
      updateMutation.mutateAsync({ generatorId, updateData }),
    deleteGenerator: deleteMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
};

// Backward-compat wrapper (fetch+sync+mutations) for existing consumers.
export const useCustomGenerators = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const data = useCustomGeneratorsData({ isActive, enabled });
  const mutations = useCustomGeneratorsMutations();
  return { ...data, ...mutations };
};

// === SAVED GENERATORS ===
export const useSavedGenerators = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncSavedGenerators = useProfileStore((state) => state.syncSavedGenerators);

  const query = useQuery<CustomGenerator[], Error>({
    queryKey: QUERY_KEYS.savedGenerators(user?.id),
    queryFn: profileApiService.getSavedGenerators,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  const unsaveMutation = useMutation({
    mutationFn: profileApiService.unsaveGenerator,
    onMutate: async (generatorId: string | number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.savedGenerators(user?.id) });
      const previousGenerators = queryClient.getQueryData<CustomGenerator[]>(
        QUERY_KEYS.savedGenerators(user?.id)
      );
      queryClient.setQueryData<CustomGenerator[]>(QUERY_KEYS.savedGenerators(user?.id), (old) => {
        if (!old) return old;
        return old.filter((generator) => String(generator.id) !== String(generatorId));
      });
      return { previousGenerators };
    },
    onError: (
      _error: Error,
      _variables: string | number,
      context: { previousGenerators: CustomGenerator[] | undefined } | undefined
    ) => {
      if (context?.previousGenerators) {
        queryClient.setQueryData(QUERY_KEYS.savedGenerators(user?.id), context.previousGenerators);
      }
    },
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncSavedGenerators(query.data);
    }
  }, [query.data, syncSavedGenerators]);

  return {
    query,
    unsaveGenerator: unsaveMutation.mutateAsync,
    isUnsaving: unsaveMutation.isPending,
    unsaveError: unsaveMutation.error,
  };
};

// === GENERATOR DOCUMENTS ===
export const useGeneratorDocuments = (generatorId: string | undefined) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const query = useQuery<Document[], Error>({
    queryKey: QUERY_KEYS.generatorDocuments(generatorId),
    queryFn: () => profileApiService.getGeneratorDocuments(generatorId!),
    enabled: !!generatorId && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
  });

  const addDocumentsMutation = useMutation({
    mutationFn: (documentIds: string[]) =>
      profileApiService.addDocumentsToGenerator(generatorId!, documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.generatorDocuments(generatorId) });
    },
  });

  const removeDocumentMutation = useMutation({
    mutationFn: (documentId: string | number) =>
      profileApiService.removeDocumentFromGenerator(generatorId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.generatorDocuments(generatorId) });
    },
  });

  return {
    query,
    addDocuments: addDocumentsMutation.mutateAsync,
    removeDocument: removeDocumentMutation.mutateAsync,
    isAddingDocuments: addDocumentsMutation.isPending,
    isRemovingDocument: removeDocumentMutation.isPending,
    addError: addDocumentsMutation.error,
    removeError: removeDocumentMutation.error,
  };
};

// === USER TEXTS ===
export const useUserTexts = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncUserTexts = useProfileStore((state) => state.syncUserTexts);

  const query = useQuery<SavedText[], Error>({
    queryKey: QUERY_KEYS.userTexts(user?.id),
    queryFn: profileApiService.getUserTexts,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ textId, newTitle }: { textId: string | number; newTitle: string }) =>
      profileApiService.updateTextTitle(textId, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteText,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    },
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncUserTexts(query.data);
    }
  }, [query.data, syncUserTexts]);

  return {
    query,
    updateTextTitle: (textId: string | number, newTitle: string) =>
      updateTitleMutation.mutateAsync({ textId, newTitle }),
    deleteText: deleteMutation.mutateAsync,
    isUpdatingTitle: updateTitleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    updateError: updateTitleMutation.error,
    deleteError: deleteMutation.error,
  };
};

// === USER TEMPLATES ===
export const useUserTemplates = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncUserTemplates = useProfileStore((state) => state.syncUserTemplates);

  const query = useQuery<UserTemplate[], Error>({
    queryKey: QUERY_KEYS.userTemplates(user?.id),
    queryFn: profileApiService.getUserTemplates,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ templateId, newTitle }: { templateId: string | number; newTitle: string }) =>
      profileApiService.updateTemplateTitle(templateId, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ templateId, isPrivate }: { templateId: string | number; isPrivate: boolean }) =>
      profileApiService.updateTemplateVisibility(templateId, isPrivate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string | number;
      data: UserTemplateUpdateData;
    }) => profileApiService.updateTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncUserTemplates(query.data);
    }
  }, [query.data, syncUserTemplates]);

  return {
    query,
    updateTemplateTitle: (templateId: string | number, newTitle: string) =>
      updateTitleMutation.mutateAsync({ templateId, newTitle }),
    deleteTemplate: deleteMutation.mutateAsync,
    updateTemplateVisibility: (templateId: string | number, isPrivate: boolean) =>
      visibilityMutation.mutateAsync({ templateId, isPrivate }),
    updateTemplate: (templateId: string | number, data: UserTemplateUpdateData) =>
      updateMutation.mutateAsync({ templateId, data }),
    isUpdatingTitle: updateTitleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdatingVisibility: visibilityMutation.isPending,
    isUpdating: updateMutation.isPending,
    updateError: updateTitleMutation.error,
    deleteError: deleteMutation.error,
  };
};

// === AVAILABLE DOCUMENTS ===
export const useAvailableDocuments = ({ enabled = true }: EnabledOnlyOptions = {}) => {
  const { user } = useOptimizedAuth();
  const syncAvailableDocuments = useProfileStore((state) => state.syncAvailableDocuments);

  const query = useQuery<Document[], Error>({
    queryKey: QUERY_KEYS.availableDocuments(user?.id),
    queryFn: profileApiService.getAvailableDocuments,
    enabled: enabled && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
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
export const useMemories = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();
  const syncMemories = useProfileStore((state) => state.syncMemories);

  const query = useQuery<Memory[], Error>({
    queryKey: QUERY_KEYS.memories(user?.id),
    queryFn: () => profileApiService.getMemories(user!.id),
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    cacheTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
  });

  const addMemoryMutation = useMutation({
    mutationFn: ({ text, topic }: { text: string; topic: string }) =>
      profileApiService.addMemory(text, topic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.memories(user?.id) });
    },
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: profileApiService.deleteMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.memories(user?.id) });
    },
  });

  // Sync with profileStore
  useEffect(() => {
    if (query.data) {
      syncMemories(query.data);
    }
  }, [query.data, syncMemories]);

  return {
    query,
    addMemory: (text: string, topic: string = '') => addMemoryMutation.mutateAsync({ text, topic }),
    deleteMemory: deleteMemoryMutation.mutateAsync,
    isAddingMemory: addMemoryMutation.isPending,
    isDeletingMemory: deleteMemoryMutation.isPending,
    addError: addMemoryMutation.error,
    deleteError: deleteMemoryMutation.error,
  };
};

// === LEGACY COMPATIBILITY ===
// Keep original exports for backward compatibility during transition
export { useProfile as useProfileData };
