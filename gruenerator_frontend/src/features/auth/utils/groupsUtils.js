/**
 * Groups management utilities following the modern auth pattern
 * Similar to anweisungenWissen but for groups functionality
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useGroupsUiStore } from '../../../stores/auth/groupsUiStore';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
  } = useGroupsUiStore();

  // Query key for user's groups
  const groupsQueryKey = ['userGroups', user?.id];

  // Fetch user's groups from backend API
  const fetchGroupsFn = async () => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    // Fetching groups for user

    const response = await fetch(`${AUTH_BASE_URL}/auth/groups`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Fehler beim Laden der Gruppen' }));
      throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
    }

    const data = await response.json();
    // Groups loaded successfully
    
    return data.groups || [];
  };

  // React Query for fetching groups
  const query = useQuery({
    queryKey: groupsQueryKey,
    queryFn: fetchGroupsFn,
    enabled: !!user?.id && isAuthenticated && !authLoading,
    staleTime: 2 * 60 * 1000, // Reduced to 2 minutes for better UX
    gcTime: 15 * 60 * 1000, // Fixed: was cacheTime (React Query v5)
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Fixed: was 'always' (React Query v5)
    refetchOnReconnect: true, // Fixed: was 'always' (React Query v5)
    retry: (failureCount) => failureCount < 2,
    refetchInterval: isActive ? 5 * 60 * 1000 : false // Auto-refetch every 5 min when tab is active
  });

  // Force refetch when tab becomes active and data is stale
  useEffect(() => {
    if (isActive && query.isStale && !query.isFetching) {
      console.log('[useGroups] Tab activated and data is stale, refetching groups');
      query.refetch();
    }
  }, [isActive]);

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async (groupName) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroups] Creating group:', groupName);

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: groupName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Erstellen der Gruppe' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroups] Group created successfully:', data.group?.id);
      
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
      console.log('[useGroups] Group creation successful, cache invalidated');
    },
    onError: (error) => {
      setCreating(false);
      console.error('[useGroups] Group creation failed:', error);
    }
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroups] Deleting group:', groupId);

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Löschen der Gruppe' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroups] Group deleted successfully');
      
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
      console.log('[useGroups] Group deletion successful, cache invalidated');
    },
    onError: (error) => {
      setDeleting(false);
      setDeletingGroupId(null);
      console.error('[useGroups] Group deletion failed:', error);
    }
  });

  // Update group info (name and description) mutation
  const updateGroupInfoMutation = useMutation({
    mutationFn: async ({ groupId, name, description }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroups] Updating group info:', groupId, { name, description });

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/info`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Aktualisieren der Gruppendetails' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroups] Group info updated successfully');
      
      return data;
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
      console.log('[useGroups] Group info update successful, cache invalidated');
    },
    onError: (error) => {
      setSaving(false);
      console.error('[useGroups] Group info update failed:', error);
    }
  });

  // Legacy update group name mutation for backward compatibility
  const updateGroupNameMutation = useMutation({
    mutationFn: async ({ groupId, name }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroups] Updating group name:', groupId, name);

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/name`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Aktualisieren des Gruppennamens' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroups] Group name updated successfully');
      
      return data;
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
      console.log('[useGroups] Group name update successful, cache invalidated');
    },
    onError: (error) => {
      setSaving(false);
      console.error('[useGroups] Group name update failed:', error);
    }
  });

  // Join group mutation
  const joinGroupMutation = useMutation({
    mutationFn: async (joinToken) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroups] Joining group with token');

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/join`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ joinToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Beitritt zur Gruppe' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroups] Group join successful:', data.group?.name);
      
      return data;
    },
    onMutate: () => {
      setJoining(true);
      clearMessages();
    },
    onSuccess: (result) => {
      setJoining(false);
      // Invalidate and refetch groups
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      console.log('[useGroups] Group join successful, cache invalidated');
    },
    onError: (error) => {
      setJoining(false);
      console.error('[useGroups] Group join failed:', error);
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

    console.log('[useGroupMembers] Fetching members for group:', groupId);

    const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/members`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Fehler beim Laden der Gruppenmitglieder' }));
      throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
    }

    const data = await response.json();
    console.log('[useGroupMembers] Members loaded successfully:', data.members?.length || 0);
    
    return data.members || [];
  };

  // React Query for fetching members
  const query = useQuery({
    queryKey: membersQueryKey,
    queryFn: fetchMembersFn,
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // Fixed: was cacheTime (React Query v5)
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Fixed: was 'always' (React Query v5)
    refetchOnReconnect: true, // Fixed: was 'always' (React Query v5)
    retry: (failureCount) => failureCount < 2,
    refetchInterval: isActive ? 10 * 60 * 1000 : false // Auto-refetch every 10 min when active
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
  } = useGroupsUiStore();

  // Query key for group content
  const groupContentQueryKey = ['groupContent', groupId];

  // Fetch group content from backend API
  const fetchGroupContentFn = async () => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }

    console.log('[useGroupSharing] Fetching group content for group:', groupId);

    const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/content`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Fehler beim Laden der Gruppeninhalte' }));
      throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
    }

    const data = await response.json();
    console.log('[useGroupSharing] Group content loaded successfully');
    
    return data.content || {};
  };

  // React Query for fetching group content
  const groupContentQuery = useQuery({
    queryKey: groupContentQueryKey,
    queryFn: fetchGroupContentFn,
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 15 * 60 * 1000, // Fixed: was cacheTime (React Query v5)
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Fixed: was 'always' (React Query v5)
    refetchOnReconnect: true, // Fixed: was 'always' (React Query v5)
    retry: (failureCount) => failureCount < 2,
    refetchInterval: isActive ? 5 * 60 * 1000 : false // Auto-refetch every 5 min when active
  });

  // Share content mutation
  const shareContentMutation = useMutation({
    mutationFn: async ({ contentType, contentId, permissions, targetGroupId }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const shareGroupId = targetGroupId || groupId;
      console.log('[useGroupSharing] Sharing content:', { contentType, contentId, shareGroupId });

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${shareGroupId}/share`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentType, contentId, permissions }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Teilen des Inhalts' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroupSharing] Content shared successfully');
      
      return data;
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
      console.log('[useGroupSharing] Content sharing successful, cache invalidated');
    },
    onError: (error) => {
      setSaving(false);
      console.error('[useGroupSharing] Content sharing failed:', error);
    }
  });

  // Unshare content mutation
  const unshareContentMutation = useMutation({
    mutationFn: async ({ contentType, contentId }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroupSharing] Unsharing content:', { contentType, contentId, groupId });

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/content/${contentId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentType }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Entfernen des geteilten Inhalts' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroupSharing] Content unshared successfully');
      
      return data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch group content
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
      console.log('[useGroupSharing] Content unsharing successful, cache invalidated');
    },
    onError: (error) => {
      setSaving(false);
      console.error('[useGroupSharing] Content unsharing failed:', error);
    }
  });

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ contentType, contentId, permissions }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[useGroupSharing] Updating permissions:', { contentType, contentId, permissions });

      const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/content/${contentId}/permissions`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contentType, permissions }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Fehler beim Aktualisieren der Berechtigungen' }));
        throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
      }

      const data = await response.json();
      console.log('[useGroupSharing] Permissions updated successfully');
      
      return data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      // Invalidate and refetch group content
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
      console.log('[useGroupSharing] Permissions update successful, cache invalidated');
    },
    onError: (error) => {
      setSaving(false);
      console.error('[useGroupSharing] Permissions update failed:', error);
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
    refetchGroupContent: groupContentQuery.refetch,

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
  
  // Fetch content from all groups using the same pattern as useGroupSharing
  const fetchAllGroupsContentFn = async () => {
    if (!user?.id || !groups?.length) {
      return { allContent: [], errors: [] };
    }

    const allContent = [];
    const errors = [];
    
    for (const group of groups) {
      try {
        console.log('[useAllGroupsContent] Fetching content for group:', group.name);
        
        const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${group.id}/content`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            message: `Fehler beim Laden der Inhalte für Gruppe ${group.name}` 
          }));
          throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
        }

        const data = await response.json();
        
        if (data.content) {
          // Add group context to all items (same as KnowledgeSelector was doing)
          const groupKnowledge = (data.content.knowledge || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          const groupDocuments = (data.content.documents || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          const groupTexts = (data.content.texts || []).map(item => ({
            ...item,
            sourceType: 'group',
            groupId: group.id,
            groupName: group.name
          }));
          
          allContent.push(...groupKnowledge, ...groupDocuments, ...groupTexts);
        }
        
        console.log('[useAllGroupsContent] Successfully loaded content for group:', group.name);
      } catch (error) {
        console.error(`[useAllGroupsContent] Error loading content for group ${group.name}:`, error);
        errors.push({ groupName: group.name, error: error.message });
      }
    }
    
    return { allContent, errors };
  };

  // React Query for fetching all groups content
  const query = useQuery({
    queryKey: allGroupsContentQueryKey,
    queryFn: fetchAllGroupsContentFn,
    enabled: enabled && !!user?.id && !!groups?.length && isAuthenticated && !authLoading && !isLoadingGroups,
    staleTime: 2 * 60 * 1000, // 2 minutes (same as useGroupSharing)
    gcTime: 15 * 60 * 1000, // Fixed: was cacheTime (React Query v5)
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Fixed: was 'always' (React Query v5)
    refetchOnReconnect: true, // Fixed: was 'always' (React Query v5)
    retry: (failureCount) => failureCount < 2,
    refetchInterval: isActive ? 5 * 60 * 1000 : false // Auto-refetch every 5 min when active
  });

  // Force refetch when tab becomes active and data is stale
  useEffect(() => {
    if (isActive && query.isStale && !query.isFetching) {
      console.log('[useAllGroupsContent] Tab activated and data is stale, refetching all groups content');
      query.refetch();
    }
  }, [isActive, query.isStale, query.isFetching, query.refetch]);

  return {
    // Data
    allGroupContent: query.data?.allContent || [],
    groupContentErrors: query.data?.errors || [],
    hasGroupErrors: (query.data?.errors || []).length > 0,
    
    // Loading states
    isLoadingAllGroupsContent: query.isPending || isLoadingGroups, // Fixed: was isLoading (React Query v5)
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