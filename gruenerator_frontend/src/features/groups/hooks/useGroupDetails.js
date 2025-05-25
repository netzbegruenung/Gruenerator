import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const MAX_KNOWLEDGE_ENTRIES = 3;
const MAX_CONTENT_LENGTH = 1000;

// Helper for comparing objects
const deepEqual = (obj1, obj2) => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

// Helper to clean up knowledge entry
const cleanKnowledgeEntry = (entry) => {
  if (!entry) return { title: '', content: '' };
  
  const cleaned = {
    id: (typeof entry.id === 'string' && entry.id.startsWith('new-')) ? undefined : entry.id,
    title: entry.title?.trim() || '',
    content: entry.content?.trim() || ''
  };
  return cleaned;
};

/**
 * Hook for managing group details including instructions and knowledge
 */
const useGroupDetails = (groupId, { isActive } = {}) => {
  const { user } = useSupabaseAuth();
  const [templatesSupabase, setTemplatesSupabase] = useState(null);
  const queryClient = useQueryClient();
  
  // Local states for editing
  const [customAntragPrompt, setCustomAntragPrompt] = useState('');
  const [customSocialPrompt, setCustomSocialPrompt] = useState('');
  const [knowledgeEntries, setKnowledgeEntries] = useState([]);
  const [groupInfo, setGroupInfo] = useState(null);
  const [joinToken, setJoinToken] = useState('');
  const [userRole, setUserRole] = useState('member');

  const initialDataLoaded = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load Supabase client
  useEffect(() => {
    let isMounted = true;
    const loadSupabaseClient = async () => {
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (isMounted && module.templatesSupabase) {
          setTemplatesSupabase(module.templatesSupabase);
        }
      } catch (error) {
        console.error('Error loading Supabase client:', error);
      }
    };
    loadSupabaseClient();
    return () => { isMounted = false; };
  }, []);

  // Query key for group details
  const groupDetailsQueryKey = ['groupDetails', groupId];

  // Fetch group details
  const fetchGroupDetailsFn = async () => {
    if (!user?.id || !templatesSupabase || !groupId) {
      throw new Error("Required data missing");
    }

    // 1. Check membership and role
    const { data: membership, error: membershipError } = await templatesSupabase
      .from('group_memberships')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (membershipError) {
      throw new Error("You are not a member of this group");
    }

    // 2. Fetch group info
    const { data: group, error: groupError } = await templatesSupabase
      .from('groups')
      .select('id, name, created_at, created_by, join_token')
      .eq('id', groupId)
      .single();

    if (groupError) {
      throw new Error(`Failed to fetch group: ${groupError.message}`);
    }

    // 3. Fetch instructions
    const { data: instructions, error: instructionsError } = await templatesSupabase
      .from('group_instructions')
      .select('group_id, custom_antrag_prompt, custom_social_prompt')
      .eq('group_id', groupId)
      .single();

    if (instructionsError && instructionsError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch instructions: ${instructionsError.message}`);
    }

    // 4. Fetch knowledge
    const { data: knowledge, error: knowledgeError } = await templatesSupabase
      .from('group_knowledge')
      .select('id, title, content, created_by, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (knowledgeError) {
      throw new Error(`Failed to fetch knowledge: ${knowledgeError.message}`);
    }

    // Determine if user is admin
    const isAdmin = membership.role === 'admin' || group.created_by === user.id;

    return {
      group,
      instructions: instructions || { group_id: groupId },
      knowledge: knowledge || [],
      role: membership.role,
      isAdmin
    };
  };

  const {
    data: queryData,
    isLoading: isLoadingDetails,
    isFetching: isFetchingDetails,
    isError: isErrorDetails,
    error: errorDetails,
    refetch: refetchDetails
  } = useQuery({
    queryKey: groupDetailsQueryKey,
    queryFn: fetchGroupDetailsFn,
    enabled: !!user?.id && !!templatesSupabase && !!groupId && isActive !== false,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Initialize local state from query data
  useEffect(() => {
    if (isLoadingDetails || !queryData || hasUnsavedChanges) return;

    setUserRole(queryData.role);
    setGroupInfo(queryData.group);
    setJoinToken(queryData.group.join_token);
    
    setCustomAntragPrompt(queryData.instructions.custom_antrag_prompt || '');
    setCustomSocialPrompt(queryData.instructions.custom_social_prompt || '');

    // Initialize knowledge entries with placeholders
    const existingEntries = queryData.knowledge.map(entry => ({ ...entry, isNew: false }));
    const emptyEntries = Array(MAX_KNOWLEDGE_ENTRIES - existingEntries.length)
      .fill(null)
      .map((_, index) => ({ 
        id: `new-${Date.now()}-${index}`, 
        title: '', 
        content: '', 
        isNew: true 
      }));
    
    setKnowledgeEntries([...existingEntries, ...emptyEntries]);
    initialDataLoaded.current = true;
    setHasUnsavedChanges(false);
  }, [queryData, isLoadingDetails, hasUnsavedChanges]);

  // Track unsaved changes
  useEffect(() => {
    if (!initialDataLoaded.current || !queryData || isLoadingDetails) return;

    let changed = false;

    // Compare instructions
    if (customAntragPrompt !== (queryData.instructions.custom_antrag_prompt || '') ||
        customSocialPrompt !== (queryData.instructions.custom_social_prompt || '')
      ) {
      changed = true;
    }

    // Compare knowledge entries
    if (!changed) {
      const currentCleanKnowledge = knowledgeEntries.map(cleanKnowledgeEntry);
      const initialCleanKnowledge = queryData.knowledge.map(cleanKnowledgeEntry);

      // Check if existing entries were modified
      for (let i = 0; i < initialCleanKnowledge.length; i++) {
        const initialEntry = initialCleanKnowledge[i];
        const currentEntry = currentCleanKnowledge.find(e => e.id === initialEntry.id);
        
        if (!currentEntry || 
            currentEntry.title !== initialEntry.title || 
            currentEntry.content !== initialEntry.content) {
          changed = true;
          break;
        }
      }

      // Check if new entries were added
      if (!changed) {
        const newFilledEntries = currentCleanKnowledge.filter(entry => 
          !entry.id && (entry.title || entry.content)
        );
        if (newFilledEntries.length > 0) {
          changed = true;
        }
      }
    }

    setHasUnsavedChanges(changed);
  }, [
    customAntragPrompt,
    customSocialPrompt,
    knowledgeEntries,
    queryData,
    isLoadingDetails
  ]);

  // Input handlers
  const handleInstructionsChange = useCallback((field, value) => {
    if (!initialDataLoaded.current) return;
    
    if (field === 'customAntragPrompt') setCustomAntragPrompt(value);
    else if (field === 'customSocialPrompt') setCustomSocialPrompt(value);
  }, []);

  const handleKnowledgeChange = useCallback((id, field, value) => {
    if (!initialDataLoaded.current) return;
    
    if (field === 'content' && value.length > MAX_CONTENT_LENGTH) {
      value = value.substring(0, MAX_CONTENT_LENGTH);
    }
    
    setKnowledgeEntries(prevEntries =>
      prevEntries.map(entry => 
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  }, []);

  // Save changes mutation
  const saveChangesMutationFn = async () => {
    if (!user?.id || !templatesSupabase || !groupId) {
      throw new Error("Required data missing");
    }

    if (!queryData) {
      throw new Error("Initial data not loaded");
    }

    const promises = [];

    // Update instructions if changed
    const instructionsUpdatePayload = {};
    let instructionsChanged = false;

    if (customAntragPrompt !== (queryData.instructions.custom_antrag_prompt || '')) {
      instructionsUpdatePayload.custom_antrag_prompt = customAntragPrompt;
      instructionsChanged = true;
    }
    
    if (customSocialPrompt !== (queryData.instructions.custom_social_prompt || '')) {
      instructionsUpdatePayload.custom_social_prompt = customSocialPrompt;
      instructionsChanged = true;
    }

    if (instructionsChanged) {
      instructionsUpdatePayload.updated_at = new Date();
      promises.push(
        templatesSupabase
          .from('group_instructions')
          .update(instructionsUpdatePayload)
          .eq('group_id', groupId)
      );
    }

    // Process knowledge entries
    const initialKnowledgeMap = new Map(queryData.knowledge.map(e => [e.id, cleanKnowledgeEntry(e)]));
    const currentKnowledgeCleaned = knowledgeEntries.map(cleanKnowledgeEntry);

    for (const currentEntry of currentKnowledgeCleaned) {
      const initialEntry = currentEntry.id ? initialKnowledgeMap.get(currentEntry.id) : null;
      const hasContent = currentEntry.title || currentEntry.content;

      if (currentEntry.id) {
        // Existing entry
        if (!initialEntry) continue;

        const wasModified = currentEntry.title !== initialEntry.title || 
                           currentEntry.content !== initialEntry.content;
        const isEmptyNow = !hasContent;
        const wasNotEmpty = initialEntry.title || initialEntry.content;

        if (wasModified && hasContent) {
          // Update existing entry
          if (currentEntry.content.length > MAX_CONTENT_LENGTH) {
            throw new Error(`Content too long for knowledge entry (ID: ${currentEntry.id})`);
          }
          
          promises.push(
            templatesSupabase
              .from('group_knowledge')
              .update({ 
                title: currentEntry.title || 'Untitled', 
                content: currentEntry.content,
                updated_at: new Date()
              })
              .eq('id', currentEntry.id)
              .eq('group_id', groupId)
          );
        } else if (isEmptyNow && wasNotEmpty) {
          // Delete entry that became empty
          promises.push(
            templatesSupabase
              .from('group_knowledge')
              .delete()
              .eq('id', currentEntry.id)
              .eq('group_id', groupId)
          );
        }
      } else if (hasContent) {
        // Insert new entry
        if (currentEntry.content.length > MAX_CONTENT_LENGTH) {
          throw new Error('Content too long for new knowledge entry');
        }
        
        promises.push(
          templatesSupabase
            .from('group_knowledge')
            .insert({
              group_id: groupId,
              title: currentEntry.title || 'Untitled',
              content: currentEntry.content,
              created_by: user.id
            })
        );
      }
    }

    // Execute all operations
    const results = await Promise.all(promises);

    // Check for errors
    results.forEach(result => {
      if (result && result.error) {
        throw new Error(`Database operation error: ${result.error.message}`);
      }
    });

    return results;
  };

  const {
    mutate: saveChanges,
    isLoading: isSaving,
    isSuccess: isSaveSuccess,
    isError: isSaveError,
    error: saveError
  } = useMutation({
    mutationFn: saveChangesMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries(groupDetailsQueryKey);
      setHasUnsavedChanges(false);
      initialDataLoaded.current = false;
    }
  });

  // Delete knowledge entry mutation
  const deleteKnowledgeMutationFn = async (entryId) => {
    if (!user?.id || !templatesSupabase || !groupId) {
      throw new Error("Required data missing");
    }

    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      return;
    }

    const { error } = await templatesSupabase
      .from('group_knowledge')
      .delete()
      .eq('id', entryId)
      .eq('group_id', groupId);

    if (error) {
      throw new Error(`Failed to delete knowledge: ${error.message}`);
    }

    return entryId;
  };

  const {
    mutate: deleteKnowledgeEntry,
    isLoading: isDeletingKnowledge,
    variables: deletingKnowledgeId,
    isError: isDeleteKnowledgeError,
    error: deleteKnowledgeError
  } = useMutation({
    mutationFn: deleteKnowledgeMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries(groupDetailsQueryKey);
      setHasUnsavedChanges(false);
      initialDataLoaded.current = false;
    }
  });

  // Handle knowledge deletion
  const handleKnowledgeDelete = useCallback((entryId) => {
    if (isDeletingKnowledge) return;

    // For new placeholder entries, just reset locally
    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      setKnowledgeEntries(prevEntries =>
        prevEntries.map(entry =>
          entry.id === entryId 
            ? { id: `new-${Date.now()}-${Math.random()}`, title: '', content: '', isNew: true }
            : entry
        )
      );
      return;
    }

    // Confirm deletion for existing entries
    if (!window.confirm("Are you sure you want to delete this knowledge entry?")) {
      return;
    }

    deleteKnowledgeEntry(entryId);
  }, [deleteKnowledgeEntry, isDeletingKnowledge]);

  return {
    // Group info
    groupInfo,
    joinToken,
    userRole,
    isAdmin: queryData?.isAdmin || false,
    
    // Local state
    customAntragPrompt,
    customSocialPrompt,
    knowledgeEntries,
    
    // Handlers
    handleInstructionsChange,
    handleKnowledgeChange,
    handleKnowledgeDelete,
    
    // Save action
    saveChanges,
    isSaving,
    isSaveSuccess,
    isSaveError,
    saveError,
    
    // Delete action
    isDeletingKnowledge,
    deletingKnowledgeId,
    isDeleteKnowledgeError,
    deleteKnowledgeError,
    
    // Query status
    isLoadingDetails,
    isFetchingDetails,
    isErrorDetails,
    errorDetails,
    refetchDetails,
    
    // Other
    hasUnsavedChanges,
    MAX_CONTENT_LENGTH
  };
};

export default useGroupDetails; 