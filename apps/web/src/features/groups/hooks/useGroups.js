/**
 * Groups management utilities following the modern auth pattern
 * Similar to anweisungenWissen but for groups functionality
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useGroupsStore } from '../../../stores/auth/groupsStore';
import apiClient from '../../../components/utils/apiClient';

// Request deduplication cache to prevent duplicate API calls
const requestCache = new Map();

/**
 * Deduplicates identical API requests that are in flight
 * @param {string} key - Unique key for the request
 * @param {Function} fetcher - Function that returns a promise
 * @returns {Promise} The deduplicated promise
 */
const deduplicatedFetch = (key, fetcher) => {
  if (requestCache.has(key)) {
    return requestCache.get(key);
  }
  
  const promise = fetcher()
    .finally(() => {
      requestCache.delete(key);
    });
  
  requestCache.set(key, promise);
  return promise;
};

/**
 * Hook for comprehensive groups management using backend API
 * Follows the same pattern as useAnweisungenWissen
 */
export const useGroups = ({ isActive } = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();
  
  // Zustand store for UI state
  const {
    isSaving, setSaving,
    isDeleting, setDeleting, deletingGroupId, setDeletingGroupId,
    isCreating, setCreating,
    isJoining, setJoining,
    clearMessages
  } = useGroupsStore();

  // Query key for user's groups
  const groupsQueryKey = ['userGroups', user?.id];

  // Fetch user's groups from backend API
  const fetchGroupsFn = async () => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    const requestKey = `groups_${user.id}`;
    return deduplicatedFetch(requestKey, async () => {
      const response = await apiClient.get('/auth/groups');
      const data = response.data;
      return data.groups || [];
    });
  };

  // React Query for fetching groups
  const query = useQuery({
    queryKey: groupsQueryKey,
    queryFn: fetchGroupsFn,
    enabled: !!user?.id && isAuthenticated && !authLoading && isActive,
    staleTime: 5 * 60 * 1000, // 5 minutes - aligned with useAnweisungenWissen
    gcTime: 15 * 60 * 1000, // 15 minutes cache time
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Always refetch on mount for fresh data
    refetchOnReconnect: true,
    retry: (failureCount) => failureCount < 2,
    refetchInterval: false
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async (groupName) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.post('/auth/groups', { name: groupName });
      const data = response.data;
      return data.group;
    },
    onMutate: () => {
      setCreating(true);
      clearMessages();
    },
    onSuccess: (newGroup) => {
      setCreating(false);
      // Invalidate and refetch groups
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      // Pre-emptively clear any cached details for the new group to prevent stale data
      queryClient.removeQueries({ queryKey: ['groupDetails', newGroup.id] });
    },
    onError: (error) => {
      setCreating(false);
    }
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      await apiClient.delete(`/auth/groups/${groupId}`);
      return groupId;
    },
    onMutate: (groupId) => {
      setDeleting(true);
      setDeletingGroupId(groupId);
      clearMessages();
    },
    onSuccess: (deletedGroupId) => {
      setDeleting(false);
      setDeletingGroupId(null);
      // Invalidate and refetch groups
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    },
    onError: (error) => {
      setDeleting(false);
      setDeletingGroupId(null);
    }
  });

  // Update group info (name and description) mutation
  const updateGroupInfoMutation = useMutation({
    mutationFn: async ({ groupId, name, description }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.put(`/auth/groups/${groupId}/info`, { name, description });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch groups to update the UI
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      // Also invalidate group details cache to update the current view
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
    },
    onError: (error) => {
      setSaving(false);
    }
  });

  // Legacy update group name mutation for backward compatibility
  const updateGroupNameMutation = useMutation({
    mutationFn: async ({ groupId, name }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.put(`/auth/groups/${groupId}/name`, { name });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch groups to update the UI
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      // Also invalidate group details cache to update the current view
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
    },
    onError: (error) => {
      setSaving(false);
    }
  });

  // Join group mutation
  const joinGroupMutation = useMutation({
    mutationFn: async (joinToken) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.post('/auth/groups/join', { joinToken });
      return response.data;
    },
    onMutate: () => {
      setJoining(true);
      clearMessages();
    },
    onSuccess: (result) => {
      setJoining(false);
      // Invalidate and refetch groups
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    },
    onError: (error) => {
      setJoining(false);
    }
  });

  // Wrapper functions for mutations
  const createGroup = (groupName, options = {}) => {
    createGroupMutation.mutate(groupName, {
      onSuccess: (newGroup) => {
        options.onSuccess?.(newGroup);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  const deleteGroup = (groupId, options = {}) => {
    deleteGroupMutation.mutate(groupId, {
      onSuccess: (deletedGroupId) => {
        options.onSuccess?.(deletedGroupId);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  const updateGroupInfo = (groupId, { name, description }, options = {}) => {
    updateGroupInfoMutation.mutate({ groupId, name, description }, {
      onSuccess: (result) => {
        options.onSuccess?.(result);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  const updateGroupName = (groupId, name, options = {}) => {
    updateGroupNameMutation.mutate({ groupId, name }, {
      onSuccess: (result) => {
        options.onSuccess?.(result);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  const joinGroup = (joinToken, options = {}) => {
    joinGroupMutation.mutate(joinToken, {
      onSuccess: (result) => {
        options.onSuccess?.(result);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  return {
    // Query data
    userGroups: query.data || [],
    isLoadingGroups: query.isPending, // Fixed: was isLoading (React Query v5)
    isFetchingGroups: query.isFetching,
    isErrorGroups: query.isError,
    errorGroups: query.error,
    refetchGroups: query.refetch,

    // Mutations
    createGroup,
    isCreatingGroup: isCreating,
    isCreateGroupError: createGroupMutation.isError,
    createGroupError: createGroupMutation.error,
    isCreateGroupSuccess: createGroupMutation.isSuccess,

    deleteGroup,
    isDeletingGroup: isDeleting,
    deletingGroupId,
    isDeleteGroupError: deleteGroupMutation.isError,
    deleteGroupError: deleteGroupMutation.error,
    isDeleteGroupSuccess: deleteGroupMutation.isSuccess,

    updateGroupInfo,
    updateGroupName,
    isUpdatingGroupName: isSaving,
    isUpdateGroupNameError: updateGroupNameMutation.isError,
    updateGroupNameError: updateGroupNameMutation.error,
    isUpdateGroupNameSuccess: updateGroupNameMutation.isSuccess,
    isUpdatingGroupInfo: updateGroupInfoMutation.isLoading,
    isUpdateGroupInfoError: updateGroupInfoMutation.isError,
    updateGroupInfoError: updateGroupInfoMutation.error,
    isUpdateGroupInfoSuccess: updateGroupInfoMutation.isSuccess,

    joinGroup,
    isJoiningGroup: isJoining,
    isJoinGroupError: joinGroupMutation.isError,
    joinGroupError: joinGroupMutation.error,
    isJoinGroupSuccess: joinGroupMutation.isSuccess,

    // UI State management
    isSaving,
    clearMessages
  };
};

/**
 * Hook for fetching group members
 */
export const useGroupMembers = (groupId, { isActive } = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  
  // Query key for group members
  const membersQueryKey = ['groupMembers', groupId];

  // Fetch group members from backend API
  const fetchMembersFn = async () => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }

    const requestKey = `members_${groupId}_${user.id}`;
    return deduplicatedFetch(requestKey, async () => {
      const response = await apiClient.get(`/auth/groups/${groupId}/members`);
      const data = response.data;
      return data.members || [];
    });
  };

  // React Query for fetching members
  const query = useQuery({
    queryKey: membersQueryKey,
    queryFn: fetchMembersFn,
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading,
    staleTime: 20 * 60 * 1000, // 20 minutes for members
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Only fetch on explicit actions
    refetchOnReconnect: true,
    retry: (failureCount) => failureCount < 2,
    refetchInterval: false // Disable auto-refetch
  });

  return {
    members: query.data || [],
    isLoadingMembers: query.isPending, // Fixed: was isLoading (React Query v5)
    isFetchingMembers: query.isFetching,
    isErrorMembers: query.isError,
    errorMembers: query.error,
    refetchMembers: query.refetch,
  };
};

/**
 * Hook for group content sharing functionality
 */
export const useGroupSharing = (groupId, { isActive } = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();
  
  // Zustand store for UI state
  const {
    isSaving, setSaving,
    clearMessages
  } = useGroupsStore();

  // Query key for group content
  const groupContentQueryKey = ['groupContent', groupId];

  // Fetch group content from backend API
  const fetchGroupContentFn = async () => {
    console.log('[useGroupSharing] fetchGroupContentFn called:', { userId: user?.id, groupId });
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }

    console.log('[useGroupSharing] Fetching group content from API...');
    const response = await apiClient.get(`/auth/groups/${groupId}/content?_t=${Date.now()}`);
    const data = response.data;
    return data.content || {};
  };

  // Debug: log query enabled state
  const queryEnabled = !!user?.id && !!groupId && isAuthenticated && !authLoading;
  console.log('[useGroupSharing] Query state:', {
    queryEnabled,
    userId: user?.id,
    groupId,
    isAuthenticated,
    authLoading,
    isActive
  });

  // React Query for fetching group content
  const groupContentQuery = useQuery({
    queryKey: groupContentQueryKey,
    queryFn: fetchGroupContentFn,
    enabled: queryEnabled,
    staleTime: 0, // Always consider stale to ensure fresh data
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Always fetch on mount
    refetchOnReconnect: true,
    retry: (failureCount) => failureCount < 2,
    refetchInterval: false
  });

  // Log query status
  console.log('[useGroupSharing] Query status:', {
    isPending: groupContentQuery.isPending,
    isFetching: groupContentQuery.isFetching,
    isStale: groupContentQuery.isStale,
    dataUpdatedAt: groupContentQuery.dataUpdatedAt,
    hasData: !!groupContentQuery.data
  });

  // Share content mutation
  const shareContentMutation = useMutation({
    mutationFn: async ({ contentType, contentId, permissions, targetGroupId }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const shareGroupId = targetGroupId || groupId;
      const response = await apiClient.post(`/auth/groups/${shareGroupId}/share`, { contentType, contentId, permissions });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: (result, variables) => {
      setSaving(false);
      // Invalidate and refetch group content
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
      // Also invalidate the target group's content if different
      if (variables.targetGroupId && variables.targetGroupId !== groupId) {
        queryClient.invalidateQueries({ queryKey: ['groupContent', variables.targetGroupId] });
      }
    },
    onError: (error) => {
      setSaving(false);
    }
  });

  // Unshare content mutation
  const unshareContentMutation = useMutation({
    mutationFn: async ({ contentType, contentId }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.delete(`/auth/groups/${groupId}/content/${contentId}`, {
        data: { contentType }
      });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch group content
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
    },
    onError: (error) => {
      setSaving(false);
    }
  });

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ contentType, contentId, permissions }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await apiClient.put(`/auth/groups/${groupId}/content/${contentId}/permissions`, { contentType, permissions });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch group content
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
    },
    onError: (error) => {
      setSaving(false);
    }
  });

  // Wrapper functions for mutations
  const shareContent = (contentType, contentId, options = {}) => {
    const { permissions, targetGroupId, onSuccess, onError } = options;
    shareContentMutation.mutate({ contentType, contentId, permissions, targetGroupId }, {
      onSuccess: (result) => {
        onSuccess?.(result);
      },
      onError: (error) => {
        onError?.(error);
      }
    });
  };

  const unshareContent = (contentType, contentId, options = {}) => {
    unshareContentMutation.mutate({ contentType, contentId }, {
      onSuccess: (result) => {
        options.onSuccess?.(result);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  const updatePermissions = (contentType, contentId, permissions, options = {}) => {
    updatePermissionsMutation.mutate({ contentType, contentId, permissions }, {
      onSuccess: (result) => {
        options.onSuccess?.(result);
      },
      onError: (error) => {
        options.onError?.(error);
      }
    });
  };

  return {
    // Query data
    groupContent: groupContentQuery.data || {},
    isLoadingGroupContent: groupContentQuery.isPending, // Fixed: was isLoading (React Query v5)
    isFetchingGroupContent: groupContentQuery.isFetching,
    isErrorGroupContent: groupContentQuery.isError,
    errorGroupContent: groupContentQuery.error,
    refetchGroupContent: async () => {
      console.log('[useGroupSharing] refetchGroupContent called');
      if (!user?.id || !groupId) {
        console.log('[useGroupSharing] Cannot refetch - missing user or groupId');
        return;
      }
      console.log('[useGroupSharing] Triggering refetch...');
      return groupContentQuery.refetch();
    },

    // Mutations
    shareContent,
    isSharing: shareContentMutation.isPending, // Fixed: was isLoading (React Query v5)
    isShareError: shareContentMutation.isError,
    shareError: shareContentMutation.error,
    isShareSuccess: shareContentMutation.isSuccess,

    unshareContent,
    isUnsharing: unshareContentMutation.isPending, // Fixed: was isLoading (React Query v5)
    isUnshareError: unshareContentMutation.isError,
    unshareError: unshareContentMutation.error,
    isUnshareSuccess: unshareContentMutation.isSuccess,

    updatePermissions,
    isUpdatingPermissions: updatePermissionsMutation.isPending, // Fixed: was isLoading (React Query v5)
    isUpdatePermissionsError: updatePermissionsMutation.isError,
    updatePermissionsError: updatePermissionsMutation.error,
    isUpdatePermissionsSuccess: updatePermissionsMutation.isSuccess,

    // UI State management
    isSaving,
    clearMessages
  };
};

/**
 * Hook for loading content from all user groups simultaneously
 * This is used by KnowledgeSelector to get a unified view of all group content
 */
export const useAllGroupsContent = ({ isActive, enabled = true } = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const { userGroups: groups, isLoadingGroups } = useGroups({ isActive });
  
  // We'll use individual useGroupSharing hooks for each group
  // This ensures we reuse the existing, working logic
  const groupContentQueries = useMemo(() => {
    if (!groups?.length) return [];
    
    return groups.map(group => ({
      groupId: group.id,
      groupName: group.name
    }));
  }, [groups]);

  // For now, we'll create a custom hook that fetches from all groups
  // We can't use multiple useGroupSharing hooks dynamically, so we'll implement
  // a similar pattern but for multiple groups
  const queryClient = useQueryClient();
  
  // Query key for all groups content
  const allGroupsContentQueryKey = ['allGroupsContent', user?.id];
  
  // Fetch content from all groups in parallel for better performance
  const fetchAllGroupsContentFn = async () => {
    if (!user?.id || !groups?.length) {
      return { allContent: [], errors: [] };
    }

    
    // Create parallel fetch promises for all groups
    const groupFetchPromises = groups.map(async (group) => {
      const requestKey = `group_content_${group.id}_${user.id}`;

      try {
        const result = await deduplicatedFetch(requestKey, async () => {
          const response = await apiClient.get(`/auth/groups/${group.id}/content`);
          return response.data;
        });

        if (result.content) {
          // Add group context to all items
          const groupKnowledge = (result.content.knowledge || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          const groupDocuments = (result.content.documents || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          const groupTexts = (result.content.texts || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          const groupContent = [...groupKnowledge, ...groupDocuments, ...groupTexts];
          
          return {
            success: true,
            content: groupContent,
            groupName: group.name
          };
        }
        
        return {
          success: true,
          content: [],
          groupName: group.name
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          groupName: group.name
        };
      }
    });

    // Wait for all requests to complete
    const results = await Promise.allSettled(groupFetchPromises);
    
    const allContent = [];
    const errors = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const groupResult = result.value;
        if (groupResult.success) {
          allContent.push(...groupResult.content);
        } else {
          errors.push({ groupName: groupResult.groupName, error: groupResult.error });
        }
      } else {
        errors.push({ groupName: groups[index]?.name || 'Unknown', error: result.reason.message });
      }
    });
    
    
    return { allContent, errors };
  };

  // React Query for fetching all groups content
  // Enable query when user is authenticated and groups are loaded (even if empty)
  const shouldFetchGroupContent = enabled && !!user?.id && isAuthenticated && !authLoading && !isLoadingGroups;
  const hasGroups = groups?.length > 0;

  const query = useQuery({
    queryKey: allGroupsContentQueryKey,
    queryFn: fetchAllGroupsContentFn,
    enabled: shouldFetchGroupContent && hasGroups,
    staleTime: 10 * 60 * 1000, // 10 minutes for all groups content
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Only fetch on explicit actions
    refetchOnReconnect: true,
    retry: (failureCount) => failureCount < 2,
    refetchInterval: false // Disable auto-refetch
  });

  // Only refetch when tab becomes active if data is very stale (>10 minutes)
  useEffect(() => {
    if (isActive && query.isStale && !query.isFetching) {
      const dataAge = Date.now() - (query.dataUpdatedAt || 0);
      const TEN_MINUTES = 10 * 60 * 1000;
      if (dataAge > TEN_MINUTES) {
        query.refetch();
      }
    }
  }, [isActive, query.isStale, query.isFetching, query.dataUpdatedAt, query.refetch]);

  // Determine the actual loading state
  // If groups are still loading, we're loading
  // If groups are loaded but empty, we're not loading (no content to fetch)
  // If groups exist and query is pending, we're loading
  const isActuallyLoading = isLoadingGroups || (hasGroups && query.isPending);

  return {
    // Data
    allGroupContent: query.data?.allContent || [],
    groupContentErrors: query.data?.errors || [],
    hasGroupErrors: (query.data?.errors || []).length > 0,

    // Loading states
    isLoadingAllGroupsContent: isActuallyLoading,
    isFetchingAllGroupsContent: query.isFetching,

    // Error states
    isErrorAllGroupsContent: query.isError,
    errorAllGroupsContent: query.error,

    // Actions
    refetchAllGroupsContent: query.refetch,

    // Invalidate cache when needed
    invalidateAllGroupsContent: () => {
      queryClient.invalidateQueries({ queryKey: allGroupsContentQueryKey });
    }
  };
};

/**
 * Helper function for group initials (moved from GroupsManagementTab)
 */
export const getGroupInitials = (groupName) => {
  if (!groupName) return 'G';
  
  if (!groupName.includes(' ')) {
    return groupName.substring(0, 2).toUpperCase();
  }
  
  const words = groupName.split(' ');
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};