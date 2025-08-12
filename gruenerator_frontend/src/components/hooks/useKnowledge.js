import { useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useGeneratorKnowledgeStore } from '../../stores/core/generatorKnowledgeStore';
import { useDocumentsStore } from '../../stores/documentsStore';
import { useAnweisungenWissen } from '../../features/auth/hooks/useProfileData';

const EMPTY_ARRAY = []; // Stable empty array reference

/**
 * Hook für die Verwaltung von Wissenseinheiten und Anweisungen
 * Orchestriert den Store und lädt Daten vom Backend
 * @param {Object} options - Configuration options
 * @param {string} options.instructionType - Type of instruction context ('antrag', 'social')
 * @param {boolean} options.enableDocuments - Whether to preload documents for the user (deprecated)
 * @param {Object} options.ui - UI configuration for KnowledgeSelector
 * @param {boolean} options.ui.enableKnowledge - Enable knowledge selection
 * @param {boolean} options.ui.enableDocuments - Enable document selection
 * @param {boolean} options.ui.enableTexts - Enable text selection
 * @param {boolean} options.ui.enableSourceSelection - Enable source selection
 */
const useKnowledge = ({ 
  instructionType = 'social', 
  enableDocuments = false, // deprecated, use ui.enableDocuments
  ui = {}
} = {}) => {
  const { user, betaFeatures } = useAuth();
  const { 
    source, 
    availableKnowledge, 
    selectedKnowledgeIds,
    isLoading,
    instructionType: storeInstructionType,
    instructions,
    isInstructionsActive,
    setAvailableKnowledge, 
    setLoading,
    setInstructions,
    setInstructionsActive,
    setInstructionType,
    getKnowledgeContent,
    getActiveInstruction,
    // Document state and actions
    setAvailableDocuments,
    // UI Configuration
    setUIConfig,
    // Reset function
    reset
  } = useGeneratorKnowledgeStore();
  
  // Access documents store for preloading
  const { fetchDocuments } = useDocumentsStore();

  // Reset store on component mount to ensure clean state
  useEffect(() => {
    // Resetting store on component mount
    reset();
  }, [reset]); // Reset function dependency - runs once on mount

  // Set instruction type context in store
  useEffect(() => {
    if (instructionType && instructionType !== storeInstructionType) {
      // Setting instruction type context
      setInstructionType(instructionType);
    }
  }, [instructionType, storeInstructionType, setInstructionType]);

  // Memoize UI configuration to prevent infinite loops
  const finalUIConfig = useMemo(() => {
    const config = {
      enableKnowledge: Boolean(ui?.enableKnowledge),
      enableDocuments: Boolean(ui?.enableDocuments) || enableDocuments, // backward compatibility
      enableTexts: Boolean(ui?.enableTexts),
      enableSourceSelection: Boolean(ui?.enableSourceSelection) || Boolean(ui?.enableKnowledge) || Boolean(ui?.enableDocuments) || Boolean(ui?.enableTexts) || false
    };
    // Computing final UI config
    return config;
  }, [
    ui?.enableKnowledge, 
    ui?.enableDocuments, 
    ui?.enableTexts, 
    ui?.enableSourceSelection, 
    enableDocuments
  ]);

  // Set UI configuration only when the memoized config changes
  useEffect(() => {
    // Setting UI configuration
    setUIConfig(finalUIConfig);
  }, [finalUIConfig]); // setUIConfig should be stable from zustand

  // Fetch user knowledge and instructions via backend API
  const fetchUserData = async () => {
    if (!user) {
      return { knowledge: EMPTY_ARRAY, instructions: { antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null } };
    }
    
    try {
      // Fetching user data
      
      // Use same auth method as useAuth (session-based with credentials)
      const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen`, {
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
      // Backend response received
      
      if (data.success) {
        return {
          knowledge: data.knowledge || EMPTY_ARRAY,
          instructions: {
            antrag: data.antragPrompt || null,
            antragGliederung: data.antragGliederung || null,
            social: data.socialPrompt || null,
            universal: data.universalPrompt || null,
            gruenejugend: data.gruenejugendPrompt || null
          }
        };
      }
      return { knowledge: EMPTY_ARRAY, instructions: { antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null } };
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
    enabled: !!user, // Always load user data when user is authenticated
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes (was cacheTime in v4)
    refetchOnWindowFocus: false,
  });

  // Debug: Log query state
  // Query state logged

  // Hook for group details (includes knowledge) - only enabled when source is group
  const groupDetailsResult = useAnweisungenWissen({ 
    isActive: source.type === 'group',
    context: 'group',
    groupId: source.type === 'group' ? source.id : null
  });
  
  const { 
    data: groupDetailsData,
    isLoading: isLoadingGroupDetails,
    error: groupDetailsError,
    refetch: refetchGroupDetails
  } = groupDetailsResult?.query || {};
  
  // Extract group knowledge from group details (with stable references)
  const groupKnowledge = groupDetailsData?.knowledge || EMPTY_ARRAY; // Use stable empty array
  const isLoadingGroupKnowledge = isLoadingGroupDetails;
  const groupKnowledgeError = groupDetailsError;
  const refetchGroupKnowledge = refetchGroupDetails;

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
    setInstructions({ antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null });
    setInstructionsActive(false);
    setLoading(false);
  }, [setAvailableKnowledge, setInstructions, setInstructionsActive, setLoading]);

  // Combined effect for data management - reduces re-render loops
  useEffect(() => {
    // Source changed
    
    // ALWAYS load user knowledge regardless of source selection
    if (userData) {
      setAvailableKnowledge(userData.knowledge);
    } else {
      setAvailableKnowledge([]);
    }
    
    // Trigger refetch if needed (for any source type)
    if (!!user && !userData && !isLoadingUserData) {
      // Triggering refetch - no data
      refreshUserData();
    }
    
    // ONLY change instructions based on source selection
    if (source.type === 'neutral') {
      setInstructions({ antrag: null, antragGliederung: null, social: null, universal: null, gruenejugend: null });
      setInstructionsActive(false);
    } else if (source.type === 'user') {
      if (userData) {
        setInstructions(userData.instructions);
        setInstructionsActive(true);
      }
    } else if (source.type === 'group') {
      // Group instructions come from groupDetailsData, knowledge comes from allGroupContent in KnowledgeSelector
      setInstructionsActive(true);
    }
    
    // Update loading state
    setLoading(isLoadingUserData || isLoadingGroupKnowledge);
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
    setLoading,
    setAvailableKnowledge,
    setInstructions,
    setInstructionsActive
  ]);

  // Preload documents when enabled and user source is selected
  useEffect(() => {
    if (enableDocuments && user && source.type === 'user') {
      // Preloading documents
      
      // Fetch documents in background
      fetchDocuments()
        .then(() => {
          // Document preloading completed
        })
        .catch((error) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[useKnowledge] Document preloading failed (non-blocking):', error);
          }
          // Don't throw - document preloading failures shouldn't block the UI
        });
    }
  }, [enableDocuments, user, source.type, fetchDocuments]);

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
    // Group data (when applicable)
    groupData: groupDetailsData,
    // Refresh functions
    refreshData: source.type === 'user' ? refreshUserData : 
                 source.type === 'group' ? refetchGroupKnowledge : 
                 () => {},
    // Error state
    error: userDataError || groupKnowledgeError
  };
};

export default useKnowledge; 