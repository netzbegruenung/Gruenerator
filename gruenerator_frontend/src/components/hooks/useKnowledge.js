import { useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useGeneratorKnowledgeStore } from '../../stores/core/generatorKnowledgeStore';
import useGroupKnowledgeItems from '../../features/groups/hooks/useGroupKnowledgeItems';

const EMPTY_ARRAY = []; // Stable empty array reference

/**
 * Hook für die Verwaltung von Wissenseinheiten und Anweisungen
 * Orchestriert den Store und lädt Daten vom Backend
 */
const useKnowledge = () => {
  const { user } = useAuth();
  const { 
    source, 
    availableKnowledge, 
    selectedKnowledgeIds,
    isLoading,
    instructions,
    isInstructionsActive,
    setAvailableKnowledge, 
    setLoading,
    setInstructions,
    setInstructionsActive,
    getKnowledgeContent
  } = useGeneratorKnowledgeStore();

  // Fetch user knowledge and instructions via backend API
  const fetchUserData = async () => {
    if (!user) {
      return { knowledge: EMPTY_ARRAY, instructions: { antrag: null, social: null } };
    }
    
    try {
      console.log('[useKnowledge] Fetching user data via fetch for user:', user.id);
      
      // Use same auth method as useAuth (session-based with credentials)
      const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';
      const response = await fetch(`${AUTH_BASE_URL}/api/auth/anweisungen-wissen`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[useKnowledge] Backend response:', data);
      
      if (data.success) {
        return {
          knowledge: data.knowledge || EMPTY_ARRAY,
          instructions: {
            antrag: data.antragPrompt || null,
            social: data.socialPrompt || null
          }
        };
      }
      return { knowledge: EMPTY_ARRAY, instructions: { antrag: null, social: null } };
    } catch (error) {
      console.error('Fehler beim Laden der Benutzer-Daten:', error);
      throw new Error('Benutzer-Daten konnten nicht geladen werden');
    }
  };

  const { 
    data: userData, 
    isLoading: isLoadingUserData,
    error: userDataError,
    refetch: refreshUserData 
  } = useQuery({
    queryKey: ['userData', user?.id], 
    queryFn: fetchUserData,
    enabled: !!user && source.type === 'user',
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes (was cacheTime in v4)
    refetchOnWindowFocus: false,
  });

  // Debug: Log query state
  console.log('[useKnowledge] Query state:', {
    user: user ? { id: user.id, email: user.email } : null,
    sourceType: source.type,
    queryEnabled: !!user && source.type === 'user',
    isLoadingUserData,
    hasUserData: !!userData
  });

  // Hook for group knowledge - only enabled when source is group
  const { 
    groupKnowledge, 
    isLoading: isLoadingGroupKnowledge,
    error: groupKnowledgeError,
    refetchGroupKnowledge
  } = useGroupKnowledgeItems(
    source.type === 'group' ? source.id : null,
    source.type === 'group'
  );

  // Memoize store update functions to prevent dependency changes
  const updateUserKnowledge = useCallback((knowledge, instructions) => {
    setAvailableKnowledge(knowledge);
    setInstructions(instructions);
    setInstructionsActive(true);
  }, [setAvailableKnowledge, setInstructions, setInstructionsActive]);

  const updateGroupKnowledge = useCallback((knowledge) => {
    setAvailableKnowledge(knowledge);
    setInstructionsActive(true);
  }, [setAvailableKnowledge, setInstructionsActive]);

  const clearKnowledge = useCallback(() => {
    setAvailableKnowledge([]);
    setInstructions({ antrag: null, social: null });
    setInstructionsActive(false);
    setLoading(false);
  }, [setAvailableKnowledge, setInstructions, setInstructionsActive, setLoading]);

  // Combined effect for data management - reduces re-render loops
  useEffect(() => {
    console.log('[useKnowledge] Source changed to:', source);
    
    if (source.type === 'neutral') {
      console.log('[useKnowledge] Clearing knowledge because source is neutral');
      clearKnowledge();
    } else if (source.type === 'user') {
      // Trigger refetch if needed
      if (!!user && !userData && !isLoadingUserData) {
        console.log('[useKnowledge] Triggering refetch because query enabled but no data');
        refreshUserData();
      }
      // Update knowledge when data is available
      if (userData) {
        updateUserKnowledge(userData.knowledge, userData.instructions);
      }
      // Update loading state
      setLoading(isLoadingUserData);
    } else if (source.type === 'group') {
      // Update knowledge when data is available
      if (groupKnowledge) {
        updateGroupKnowledge(groupKnowledge);
      }
      // Update loading state
      setLoading(isLoadingGroupKnowledge);
    }
  }, [
    source, 
    user, 
    userData, 
    isLoadingUserData, 
    groupKnowledge, 
    isLoadingGroupKnowledge,
    refreshUserData,
    updateUserKnowledge,
    updateGroupKnowledge, 
    clearKnowledge,
    setLoading
  ]);

  return {
    // Store state
    source,
    availableKnowledge,
    selectedKnowledgeIds,
    isLoading,
    instructions,
    isInstructionsActive,
    // Store actions
    getKnowledgeContent,
    // Refresh functions
    refreshData: source.type === 'user' ? refreshUserData : 
                 source.type === 'group' ? refetchGroupKnowledge : 
                 () => {},
    // Error state
    error: userDataError || groupKnowledgeError
  };
};

export default useKnowledge; 