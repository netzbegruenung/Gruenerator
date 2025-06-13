import { useAuth } from '../../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
// Direct import of the Supabase client instance
import { templatesSupabase } from '../../../components/utils/templatesSupabaseClient';

const EMPTY_ARRAY = []; // Stable empty array reference

/**
 * Hook to fetch knowledge entries for a specific group.
 * @param {string} groupId - The ID of the group for which to fetch knowledge entries.
 * @param {boolean} enabled - Whether the query should be enabled. Defaults to true if groupId is provided.
 * @returns {object} - { groupKnowledge, isLoading, isError, error, refetchGroupKnowledge }
 */
const useGroupKnowledgeItems = (groupId, enabled = !!groupId) => {
  const { user: supabaseUser } = useAuth();

  // The Supabase client is now imported directly, so no useEffect/useState needed for it.

  const queryKey = ['groupKnowledgeItems', groupId, supabaseUser?.id]; // Added user.id to queryKey for user-specific group data if necessary

  const fetchGroupKnowledgeFn = async () => {
    // templatesSupabase is now directly available due to static import.
    if (!supabaseUser?.id || !templatesSupabase || !groupId) {
      // console.warn('[useGroupKnowledgeItems] Required data missing for fetch: user, templatesSupabase, or groupId');
      return EMPTY_ARRAY; // Return stable empty array if prerequisites are not met
    }

    const { data, error } = await templatesSupabase
      .from('group_knowledge')
      .select('id, title, content, created_by, created_at') // Select necessary fields
      .eq('group_id', groupId)
      // Consider if user_id should also be part of the .eq() if group_knowledge is user-specific within a group
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[useGroupKnowledgeItems] Error fetching group knowledge:', error);
      throw new Error(`Failed to fetch group knowledge: ${error.message}`);
    }
    
    return data || EMPTY_ARRAY; // Ensure stable array reference if data is null/undefined
  };

  const {
    data: groupKnowledgeData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: queryKey,
    queryFn: fetchGroupKnowledgeFn,
    // templatesSupabase is available at module scope, so check is simpler.
    // Query will only be enabled if user, templatesSupabase, groupId, and the passed 'enabled' prop are all truthy.
    enabled: !!supabaseUser?.id && !!templatesSupabase && !!groupId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  });

  return {
    groupKnowledge: groupKnowledgeData ?? EMPTY_ARRAY, // Use nullish coalescing for stable empty array
    isLoading: isLoading || isFetching, // Combine isLoading and isFetching for a general loading state
    isError,
    error,
    refetchGroupKnowledge: refetch
  };
};

export default useGroupKnowledgeItems; 