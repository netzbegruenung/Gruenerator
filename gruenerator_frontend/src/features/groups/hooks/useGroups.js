import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

/**
 * Hook for managing user groups
 */
const useGroups = ({ isActive } = {}) => {
  const { user } = useSupabaseAuth();
  const [templatesSupabase, setTemplatesSupabase] = useState(null);
  const queryClient = useQueryClient();

  // Load Supabase client
  useEffect(() => {
    let isMounted = true;
    const loadSupabaseClient = async () => {
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (isMounted && module.templatesSupabase) {
          setTemplatesSupabase(module.templatesSupabase);
        } else if (isMounted) {
        }
      } catch (error) {
      }
    };
    loadSupabaseClient();
    return () => { isMounted = false; };
  }, []);

  // Query key for user's groups
  const groupsQueryKey = ['userGroups', user?.id];

  // Fetch groups where user is a member
  const fetchGroupsFn = async () => {
    if (!user?.id || !templatesSupabase) {
      throw new Error("User or Supabase client not available");
    }

    const { data: memberships, error: membershipsError } = await templatesSupabase
      .from('group_memberships')
      .select('group_id, role')
      .eq('user_id', user.id);

    if (membershipsError) {
      throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const groupIds = memberships.map(m => m.group_id);
    
    const { data: groupsData, error: groupsError } = await templatesSupabase
      .from('groups')
      .select('id, name, created_at, created_by')
      .in('id', groupIds);

    if (groupsError) {
      throw new Error(`Failed to fetch groups: ${groupsError.message}`);
    }

    // Combine group and membership data
    const combinedGroups = groupsData.map(group => ({
      ...group,
      role: memberships.find(m => m.group_id === group.id)?.role || 'member',
      isAdmin: group.created_by === user.id || 
              memberships.find(m => m.group_id === group.id)?.role === 'admin'
    }));
    return combinedGroups;
  };

  const {
    data: queryUserGroups,
    isLoading: isLoadingGroups,
    isFetching: isFetchingGroups,
    isError: isErrorGroups,
    error: errorGroups,
    refetch: refetchGroups
  } = useQuery({
    queryKey: groupsQueryKey,
    queryFn: fetchGroupsFn,
    enabled: !!user?.id && !!templatesSupabase && isActive !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  });

  // Sicherstellen, dass immer eine neue Array-Referenz zurückgegeben wird, wenn sich die Daten ändern
  // und um ein stabiles leeres Array zurückzugeben, wenn keine Daten vorhanden sind oder geladen werden.
  const userGroups = queryUserGroups ? [...queryUserGroups] : [];

  // Create a new group
  const createGroupMutationFn = async (groupName) => {
    if (!user?.id || !templatesSupabase) {
      throw new Error("User or Supabase client not available");
    }

    if (!groupName?.trim()) {
      throw new Error("Group name is required");
    }

    // 1. Create the group
    const { data: newGroup, error: groupError } = await templatesSupabase
      .from('groups')
      .insert({
        name: groupName.trim(),
        created_by: user.id
      })
      .select('id')
      .single();

    if (groupError) {
      throw new Error(`Failed to create group: ${groupError.message}`);
    }

    // 2. Create membership for the creator with admin role
    const { error: membershipError } = await templatesSupabase
      .from('group_memberships')
      .insert({
        group_id: newGroup.id,
        user_id: user.id,
        role: 'admin'
      });

    if (membershipError) {
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }

    // 3. Create empty instructions entry
    const { error: instructionsError } = await templatesSupabase
      .from('group_instructions')
      .insert({
        group_id: newGroup.id
      });

    if (instructionsError) {
      throw new Error(`Failed to create instructions: ${instructionsError.message}`);
    }

    return newGroup.id;
  };

  const {
    mutate: createGroup,
    isLoading: isCreatingGroup,
    isError: isCreateGroupError,
    error: createGroupError,
    isSuccess: isCreateGroupSuccess
  } = useMutation({
    mutationFn: createGroupMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    }
  });

  // Generate a new join token for a group
  const regenerateJoinTokenMutationFn = async (groupId) => {
    if (!user?.id || !templatesSupabase || !groupId) {
      throw new Error("Required data missing");
    }

    // Generate a random token
    const randomToken = Math.random().toString(36).substring(2, 15) + 
                         Math.random().toString(36).substring(2, 15);

    const { data, error } = await templatesSupabase
      .from('groups')
      .update({ join_token: randomToken })
      .eq('id', groupId)
      .eq('created_by', user.id) // Ensure user is the creator
      .select('join_token')
      .single();

    if (error) {
      throw new Error(`Failed to regenerate token: ${error.message}`);
    }

    return data.join_token;
  };

  const {
    mutate: regenerateJoinToken,
    isLoading: isRegeneratingToken,
    isError: isRegenerateTokenError,
    error: regenerateTokenError
  } = useMutation({
    mutationFn: regenerateJoinTokenMutationFn
  });

  // Join a group with token
  const joinGroupMutationFn = async (joinToken) => {
    if (!user?.id || !templatesSupabase || !joinToken) {
      throw new Error("Required data missing");
    }

    // 1. Get the group ID from the token
    const { data: group, error: groupError } = await templatesSupabase
      .from('groups')
      .select('id')
      .eq('join_token', joinToken)
      .single();

    if (groupError) {
      throw new Error("Invalid or expired invite link");
    }

    // 2. Check if already a member
    const { data: existingMembership, error: membershipCheckError } = await templatesSupabase
      .from('group_memberships')
      .select('group_id')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipCheckError) {
      throw new Error(`Failed to check membership: ${membershipCheckError.message}`);
    }

    if (existingMembership) {
      return { alreadyMember: true, groupId: group.id };
    }

    // 3. Create membership
    const { error: createMembershipError } = await templatesSupabase
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member'
      });

    if (createMembershipError) {
      throw new Error(`Failed to join group: ${createMembershipError.message}`);
    }

    return { success: true, groupId: group.id };
  };

  const {
    mutate: joinGroup,
    isLoading: isJoiningGroup,
    isError: isJoinGroupError,
    error: joinGroupError,
    isSuccess: isJoinGroupSuccess
  } = useMutation({
    mutationFn: joinGroupMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    }
  });

  // Delete a group and all its related data
  const deleteGroupMutationFn = async (groupId) => {
    if (!user?.id || !templatesSupabase || !groupId) {
      throw new Error("User, Supabase client, or Group ID not available");
    }

    // Check if the user is an admin of the group (or the creator)
    // This is a client-side check; RLS should enforce this server-side ideally.
    const { data: groupMembership, error: adminCheckError } = await templatesSupabase
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (adminCheckError || !groupMembership || groupMembership.role !== 'admin') {
        // As a fallback, check if the user is the creator of the group,
        // which also grants admin-like privileges for deletion in this context.
        const { data: groupData, error: groupFetchError } = await templatesSupabase
            .from('groups')
            .select('created_by')
            .eq('id', groupId)
            .single();

        if (groupFetchError || !groupData || groupData.created_by !== user.id) {
            throw new Error("User is not authorized to delete this group.");
        }
    }


    // 1. Delete group_knowledge entries
    const { error: knowledgeError } = await templatesSupabase
      .from('group_knowledge')
      .delete()
      .eq('group_id', groupId);

    if (knowledgeError) {
      throw new Error(`Failed to delete group knowledge: ${knowledgeError.message}`);
    }

    // 2. Delete group_instructions entry
    const { error: instructionsError } = await templatesSupabase
      .from('group_instructions')
      .delete()
      .eq('group_id', groupId);

    if (instructionsError) {
      throw new Error(`Failed to delete group instructions: ${instructionsError.message}`);
    }

    // 3. Delete group_memberships entries
    const { error: membershipsError } = await templatesSupabase
      .from('group_memberships')
      .delete()
      .eq('group_id', groupId);

    if (membershipsError) {
      throw new Error(`Failed to delete group memberships: ${membershipsError.message}`);
    }

    // 4. Delete the group itself
    const { error: groupError } = await templatesSupabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (groupError) {
      throw new Error(`Failed to delete group: ${groupError.message}`);
    }

    return groupId; // Return the ID of the deleted group
  };

  const {
    mutate: deleteGroup,
    isLoading: isDeletingGroup,
    isError: isDeleteGroupError,
    error: deleteGroupError,
    isSuccess: isDeleteGroupSuccess
  } = useMutation({
    mutationFn: deleteGroupMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    }
  });

  return {
    userGroups,
    isLoadingGroups,
    isFetchingGroups,
    isErrorGroups,
    errorGroups,
    refetchGroups,
    
    createGroup,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
    isCreateGroupSuccess,
    
    regenerateJoinToken,
    isRegeneratingToken,
    isRegenerateTokenError,
    regenerateTokenError,
    
    joinGroup,
    isJoiningGroup,
    isJoinGroupError,
    joinGroupError,
    isJoinGroupSuccess,

    deleteGroup,
    isDeletingGroup,
    isDeleteGroupError,
    deleteGroupError,
    isDeleteGroupSuccess
  };
};

export default useGroups; 