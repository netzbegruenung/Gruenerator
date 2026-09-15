/**
 * Centralized hook for all profile-related data operations
 * Uses React Query with the profileApiService for consistent caching and state management
 * Syncs with profileStore for UI state management and optimistic updates
 */
import { deriveIndexingState } from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { invalidateFileMentions } from '../../notebook/utils/invalidateFileMentions';
import {
  type AnweisungenSaveData,
  type AnweisungenWissen,
  type BundleOptions,
  type Document,
  type Profile,
  type ProfileBundle,
  type SavedText,
  type UserTemplate,
  type UserTemplateUpdateData,
  profileApiService,
} from '../services/profileApiService';

import type { NotebookCollection, NotebookCollectionInput } from '../../../types/notebook';

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
  userTexts: (userId: string | undefined) => ['userTexts', userId] as const,
  userTemplates: (userId: string | undefined) => ['userTemplates', userId] as const,
  availableDocuments: (userId: string | undefined) => ['availableDocuments', userId] as const,
};

// === PROFILE DATA ===
export const useProfile = (userId?: string) => {
  const user = useAuthStore((s) => s.user);
  const actualUserId = userId || user?.id;
  const syncProfile = useProfileStore((state) => state.syncProfile);

  const query = useQuery<Profile, Error>({
    queryKey: QUERY_KEYS.profile(actualUserId),
    queryFn: profileApiService.getProfile,
    enabled: !!actualUserId,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount: number) => failureCount < 2,
    refetchInterval: false,
    placeholderData: user
      ? {
          avatar_robot_id: user.avatar_robot_id,
          display_name: user.display_name,
          email: user.email,
        }
      : undefined,
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
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const defaultOptions: Required<BundleOptions> = {
    includeAnweisungen: true,
    includeNotebookCollections: true,
    includeCustomGenerators: true,
    includeUserTexts: false,
    includeUserTemplates: false,
  };

  const mergedOptions: Required<BundleOptions> = { ...defaultOptions, ...options };

  return useQuery<ProfileBundle, Error>({
    queryKey: QUERY_KEYS.bundledProfile(userId, mergedOptions),
    queryFn: () => profileApiService.getBundledProfileData(mergedOptions),
    enabled: !!userId,
    staleTime: 15 * 60 * 1000, // 15 minutes cache
    gcTime: 30 * 60 * 1000, // 30 minutes in memory
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: (failureCount: number) => failureCount < 2,
  });
};

// === ANWEISUNGEN & WISSEN ===
export const useAnweisungenWissen = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

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
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.refetchQueries({ queryKey, exact: true });
    },
  });

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
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery<NotebookCollection[], Error>({
    queryKey: QUERY_KEYS.notebookCollections(user?.id),
    queryFn: profileApiService.getNotebookCollections,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 1,
    // Indexing finishes in the background, with nothing pushing the result to
    // the client. Without this poll a freshly created notebook kept its "Wird
    // indexiert" badge until the user reloaded — the 15-minute staleTime made
    // "it never becomes ready" the normal experience. Stops on its own once
    // every notebook is settled.
    refetchInterval: (q) =>
      (q.state.data ?? []).some(
        (c) => (c.indexing_state ?? deriveIndexingState(c.documents ?? [])) === 'indexing'
      )
        ? 5000
        : false,
  });

  const createMutation = useMutation({
    mutationFn: profileApiService.createQACollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      invalidateFileMentions(queryClient);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      collectionId,
      collectionData,
    }: {
      collectionId: string | number;
      collectionData: NotebookCollectionInput;
    }) => profileApiService.updateQACollection(collectionId, collectionData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      invalidateFileMentions(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteQACollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      invalidateFileMentions(queryClient);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (collectionId: string | number) => profileApiService.syncQACollection(collectionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebookCollections(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notebook', 'collection'] });
      invalidateFileMentions(queryClient);
    },
  });

  const getQACollection = (collectionId: string | number): NotebookCollection | undefined => {
    const collections = query.data || [];
    return collections.find((c) => c.id === collectionId);
  };

  return {
    query,
    createQACollection: createMutation.mutateAsync,
    updateQACollection: (collectionId: string | number, collectionData: NotebookCollectionInput) =>
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

// === USER TEXTS ===
export const useUserTexts = ({ isActive, enabled = true }: TabHookOptions = {}) => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery<SavedText[], Error>({
    queryKey: QUERY_KEYS.userTexts(user?.id),
    queryFn: profileApiService.getUserTexts,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ textId, newTitle }: { textId: string | number; newTitle: string }) =>
      profileApiService.updateTextTitle(textId, newTitle),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteText,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTexts(user?.id) });
    },
  });

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
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery<UserTemplate[], Error>({
    queryKey: QUERY_KEYS.userTemplates(user?.id),
    queryFn: profileApiService.getUserTemplates,
    enabled: enabled && !!user?.id && isActive,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    gcTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ templateId, newTitle }: { templateId: string | number; newTitle: string }) =>
      profileApiService.updateTemplateTitle(templateId, newTitle),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: profileApiService.deleteTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ templateId, isPrivate }: { templateId: string | number; isPrivate: boolean }) =>
      profileApiService.updateTemplateVisibility(templateId, isPrivate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
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
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userTemplates(user?.id) });
    },
  });

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
  const user = useAuthStore((s) => s.user);

  const query = useQuery<Document[], Error>({
    queryKey: QUERY_KEYS.availableDocuments(user?.id),
    queryFn: profileApiService.getAvailableDocuments,
    enabled: enabled && !!user?.id,
    staleTime: 15 * 60 * 1000, // Increased from 5 to 15 minutes
    gcTime: 30 * 60 * 1000, // Increased from 15 to 30 minutes
  });

  return query;
};

// === LEGACY COMPATIBILITY ===
// Keep original exports for backward compatibility during transition
export { useProfile as useProfileData };
