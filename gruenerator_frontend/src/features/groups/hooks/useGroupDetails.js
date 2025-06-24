import { useState, useEffect, useCallback, useRef } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const MAX_KNOWLEDGE_ENTRIES = 3;
const MAX_CONTENT_LENGTH = 1000;
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
 * Refactored to use backend API following modern auth pattern
 */
const useGroupDetails = (groupId, { isActive } = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();
  
  // Local states for editing
  const [customAntragPrompt, setCustomAntragPrompt] = useState('');
  const [customSocialPrompt, setCustomSocialPrompt] = useState('');
  const [antragInstructionsEnabled, setAntragInstructionsEnabled] = useState(false);
  const [socialInstructionsEnabled, setSocialInstructionsEnabled] = useState(false);
  const [knowledgeEntries, setKnowledgeEntries] = useState([]);
  const [groupInfo, setGroupInfo] = useState(null);
  const [joinToken, setJoinToken] = useState('');
  const [userRole, setUserRole] = useState('member');

  const initialDataLoaded = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Query key for group details
  const groupDetailsQueryKey = ['groupDetails', groupId];

  // Fetch group details via backend API
  const fetchGroupDetailsFn = async () => {
    if (!user?.id || !groupId) {
      throw new Error("Required data missing");
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/details`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch group details');
    }

    return {
      group: data.group,
      instructions: data.instructions,
      knowledge: data.knowledge,
      membership: data.membership
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
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading && isActive !== false,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Initialize local state from query data
  useEffect(() => {
    if (isLoadingDetails || !queryData || hasUnsavedChanges) return;

    setUserRole(queryData.membership.role);
    setGroupInfo({
      ...queryData.group,
      antrag_instructions_enabled: queryData.instructions.antrag_instructions_enabled,
      social_instructions_enabled: queryData.instructions.social_instructions_enabled
    });
    setJoinToken(queryData.group.join_token);
    
    setCustomAntragPrompt(queryData.instructions.custom_antrag_prompt || '');
    setCustomSocialPrompt(queryData.instructions.custom_social_prompt || '');
    setAntragInstructionsEnabled(queryData.instructions.antrag_instructions_enabled || false);
    setSocialInstructionsEnabled(queryData.instructions.social_instructions_enabled || false);

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
        customSocialPrompt !== (queryData.instructions.custom_social_prompt || '') ||
        antragInstructionsEnabled !== (queryData.instructions.antrag_instructions_enabled || false) ||
        socialInstructionsEnabled !== (queryData.instructions.social_instructions_enabled || false)
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
    antragInstructionsEnabled,
    socialInstructionsEnabled,
    knowledgeEntries,
    queryData,
    isLoadingDetails
  ]);

  // Input handlers
  const handleInstructionsChange = useCallback((field, value) => {
    if (!initialDataLoaded.current) return;
    
    if (field === 'custom_antrag_prompt') setCustomAntragPrompt(value);
    else if (field === 'custom_social_prompt') setCustomSocialPrompt(value);
    else if (field === 'antrag_instructions_enabled') setAntragInstructionsEnabled(value);
    else if (field === 'social_instructions_enabled') setSocialInstructionsEnabled(value);
  }, []);

  const handleKnowledgeChange = useCallback((id, content, action = 'update') => {
    if (!initialDataLoaded.current) return;
    
    if (action === 'add') {
      // Add new knowledge entry
      const newEntry = {
        id: `new-${Date.now()}`,
        title: 'Untitled',
        content: '',
        isNew: true
      };
      setKnowledgeEntries(prevEntries => {
        // Replace first empty entry
        const firstEmptyIndex = prevEntries.findIndex(entry => !entry.content && !entry.title);
        if (firstEmptyIndex !== -1) {
          const newEntries = [...prevEntries];
          newEntries[firstEmptyIndex] = newEntry;
          return newEntries;
        }
        return prevEntries;
      });
      return;
    }
    
    if (content && content.length > MAX_CONTENT_LENGTH) {
      content = content.substring(0, MAX_CONTENT_LENGTH);
    }
    
    setKnowledgeEntries(prevEntries =>
      prevEntries.map(entry => 
        entry.id === id ? { ...entry, content } : entry
      )
    );
  }, []);

  // Save changes mutation - split into instructions and knowledge operations
  const saveChangesMutationFn = async () => {
    if (!user?.id || !groupId) {
      throw new Error("Required data missing");
    }

    if (!queryData) {
      throw new Error("Initial data not loaded");
    }

    const promises = [];

    // Update instructions if changed
    let instructionsChanged = false;
    const instructionsPayload = {};

    if (customAntragPrompt !== (queryData.instructions.custom_antrag_prompt || '')) {
      instructionsPayload.custom_antrag_prompt = customAntragPrompt;
      instructionsChanged = true;
    }
    
    if (customSocialPrompt !== (queryData.instructions.custom_social_prompt || '')) {
      instructionsPayload.custom_social_prompt = customSocialPrompt;
      instructionsChanged = true;
    }

    if (antragInstructionsEnabled !== (queryData.instructions.antrag_instructions_enabled || false)) {
      instructionsPayload.antrag_instructions_enabled = antragInstructionsEnabled;
      instructionsChanged = true;
    }

    if (socialInstructionsEnabled !== (queryData.instructions.social_instructions_enabled || false)) {
      instructionsPayload.social_instructions_enabled = socialInstructionsEnabled;
      instructionsChanged = true;
    }

    if (instructionsChanged) {
      const instructionsPromise = fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/instructions`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(instructionsPayload)
      }).then(response => {
        if (!response.ok) {
          throw new Error(`Instructions update failed: ${response.status}`);
        }
        return response.json();
      }).then(data => {
        if (!data.success) {
          throw new Error(data.message || 'Failed to update instructions');
        }
        return data;
      });

      promises.push(instructionsPromise);
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
          
          const updatePromise = fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/knowledge/${currentEntry.id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              title: currentEntry.title || 'Untitled',
              content: currentEntry.content
            })
          }).then(response => {
            if (!response.ok) {
              throw new Error(`Knowledge update failed: ${response.status}`);
            }
            return response.json();
          }).then(data => {
            if (!data.success) {
              throw new Error(data.message || 'Failed to update knowledge');
            }
            return data;
          });

          promises.push(updatePromise);
        } else if (isEmptyNow && wasNotEmpty) {
          // Delete entry that became empty
          const deletePromise = fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/knowledge/${currentEntry.id}`, {
            method: 'DELETE',
            credentials: 'include'
          }).then(response => {
            if (!response.ok) {
              throw new Error(`Knowledge deletion failed: ${response.status}`);
            }
            return response.json();
          }).then(data => {
            if (!data.success) {
              throw new Error(data.message || 'Failed to delete knowledge');
            }
            return data;
          });

          promises.push(deletePromise);
        }
      } else if (hasContent) {
        // Insert new entry
        if (currentEntry.content.length > MAX_CONTENT_LENGTH) {
          throw new Error('Content too long for new knowledge entry');
        }
        
        const createPromise = fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/knowledge`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: currentEntry.title || 'Untitled',
            content: currentEntry.content
          })
        }).then(response => {
          if (!response.ok) {
            throw new Error(`Knowledge creation failed: ${response.status}`);
          }
          return response.json();
        }).then(data => {
          if (!data.success) {
            throw new Error(data.message || 'Failed to create knowledge');
          }
          return data;
        });

        promises.push(createPromise);
      }
    }

    // Execute all operations
    const results = await Promise.all(promises);
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
    if (!user?.id || !groupId) {
      throw new Error("Required data missing");
    }

    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      return;
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/groups/${groupId}/knowledge/${entryId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to delete knowledge');
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
    isAdmin: queryData?.membership?.isAdmin || false,
    
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