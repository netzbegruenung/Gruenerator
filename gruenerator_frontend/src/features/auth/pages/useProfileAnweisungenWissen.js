import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Import React Query hooks

const MAX_KNOWLEDGE_ENTRIES = 3;
const MAX_CONTENT_LENGTH = 1000;

// Helper for deep comparison (simple version)
const deepEqual = (obj1, obj2) => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

// Helper to prepare knowledge entry for comparison/saving (removes temporary flags)
const cleanKnowledgeEntry = (entry) => {
    if (!entry) return { title: '', content: '' }; // Return empty structure for comparison
    // Ensure defined values for comparison, treat null/undefined as empty string
    // Keep the id if it's not temporary, needed for updates/deletes
    const cleaned = {
      id: (typeof entry.id === 'string' && entry.id.startsWith('new-')) ? undefined : entry.id,
      title: entry.title?.trim() || '',
      content: entry.content?.trim() || ''
    };
    return cleaned;
};

export const useProfileAnweisungenWissen = ({ isActive }) => {
  const { supabaseUser: user } = useAuthStore();
  const [templatesSupabase, setTemplatesSupabase] = useState(null);
  const queryClient = useQueryClient(); // Get query client instance

  // Local states for user edits - these remain essential
  const [customAntragPrompt, setCustomAntragPrompt] = useState('');
  const [customSocialPrompt, setCustomSocialPrompt] = useState('');
  const [knowledgeEntries, setKnowledgeEntries] = useState([]); // Local editable state

  const initialDataLoaded = useRef(false); // Track if initial data has been set to local state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Effect to dynamically load templatesSupabase client
  useEffect(() => {
    let isMounted = true;
    const loadSupabaseClient = async () => {
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (isMounted && module.templatesSupabase) {
          setTemplatesSupabase(module.templatesSupabase);
        } else if (isMounted) {
          console.warn('Templates Supabase client konnte nicht geladen werden.');
          setHasUnsavedChanges(false);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Fehler beim dynamischen Import des Supabase Clients:', error);
          setHasUnsavedChanges(false);
        }
      }
    };
    loadSupabaseClient();
    return () => { isMounted = false; };
  }, []);

  // --- React Query: Fetch Anweisungen & Wissen --- 
  const queryKey = ['profileAnweisungenWissen', user?.id];

  const fetchAnweisungenWissenFn = async () => {
    if (!user?.id || !templatesSupabase) {
      // Should not happen if 'enabled' flag is set correctly, but good practice
      throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
    }

    console.log("[RQ Fetch] Fetching Anweisungen & Wissen...");

      // Fetch Anweisungen (from profiles)
      const { data: profileData, error: profileError } = await templatesSupabase
        .from('profiles')
        .select('custom_antrag_prompt, custom_social_prompt')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(`Profil-Daten Fehler: ${profileError.message}`);
      }

      // Fetch Wissen (from user_knowledge)
      const { data: knowledgeData, error: knowledgeError } = await templatesSupabase
        .from('user_knowledge')
          .select('id, title, content') // Select ID for updates/deletes
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(MAX_KNOWLEDGE_ENTRIES);

      if (knowledgeError) {
         throw new Error(`Wissens-Daten Fehler: ${knowledgeError.message}`);
      }
      
    // Combine results
    return {
      antragPrompt: profileData?.custom_antrag_prompt || '',
      socialPrompt: profileData?.custom_social_prompt || '',
      knowledge: knowledgeData || []
    };
  };

  const { 
    data: queryData, // Contains { antragPrompt, socialPrompt, ..., knowledge: [...] }
    isLoading: isLoadingQuery, // Loading state for the initial fetch
    isFetching: isFetchingQuery, // Indicates background fetching/refreshing
    isError: isErrorQuery,
    error: errorQuery, // Error object from fetching
    isSuccess: isSuccessQuery // True if query has successfully fetched data
  } = useQuery(
    {
      queryKey: queryKey, 
      queryFn: fetchAnweisungenWissenFn, 
      enabled: !!user?.id && !!templatesSupabase && isActive, // Use isActive here
      staleTime: 5 * 60 * 1000, // Data is considered fresh for 5 minutes
      cacheTime: 15 * 60 * 1000, // Keep data in cache for 15 minutes after inactive
      refetchOnWindowFocus: false, // Optional: disable refetch on focus
      // onSuccess is generally discouraged for side effects, use useEffect instead
    }
  );

  // --- Effect to initialize/reset local state from query data --- 
  useEffect(() => {
    // Only set initial state once after the first successful fetch
    // or after a mutation caused an invalidation and refetch
    if (isSuccessQuery && queryData && !hasUnsavedChanges) { 
      console.log("[RQ Effect] Initializing/Resetting local state from query data.");
      setCustomAntragPrompt(queryData.antragPrompt);
      setCustomSocialPrompt(queryData.socialPrompt);

      // Initialize knowledge entries with placeholders
      const existingEntries = queryData.knowledge.map(entry => ({ ...entry, isNew: false }));
      const emptyEntryPlaceholders = Array(MAX_KNOWLEDGE_ENTRIES - existingEntries.length)
        .fill(null)
        .map((_, index) => ({ id: `new-${Date.now()}-${index}`, title: '', content: '', isNew: true }));
      setKnowledgeEntries([...existingEntries, ...emptyEntryPlaceholders]);
  
      initialDataLoaded.current = true; // Mark initial load as complete
      setHasUnsavedChanges(false); // Ensure it's false after reset
    }
  }, [isSuccessQuery, queryData, hasUnsavedChanges]); // Re-run when query data changes (after fetch/refetch) if no unsaved changes exist

  // --- Effect to track unsaved changes --- 
  useEffect(() => {
    // Don't check for changes until initial data is loaded and reflected in local state
    if (!initialDataLoaded.current || !queryData || isLoadingQuery) {
      return;
    }

    let changed = false;
    // Compare Anweisungen
    if (customAntragPrompt !== queryData.antragPrompt ||
        customSocialPrompt !== queryData.socialPrompt
      ) {
      changed = true;
    }

    // Compare Knowledge Entries
    const currentCleanKnowledge = knowledgeEntries.map(cleanKnowledgeEntry);
    const initialCleanKnowledge = queryData.knowledge.map(cleanKnowledgeEntry);

    // Check if existing entries were modified or deleted (turned empty)
    for (let i = 0; i < initialCleanKnowledge.length; i++) {
      const initialEntry = initialCleanKnowledge[i];
      const currentEntry = currentCleanKnowledge.find(e => e.id === initialEntry.id);
      if (!currentEntry || // Entry was deleted (or ID changed - shouldn't happen)
          currentEntry.title !== initialEntry.title || 
          currentEntry.content !== initialEntry.content) {
        changed = true;
        break;
      }
    }
    
    // Check if new entries (placeholders) have been filled
    if (!changed) {
        const newFilledEntries = currentCleanKnowledge.filter(entry => 
            !entry.id && // It's a new entry (temporary ID removed by cleanKnowledgeEntry)
            (entry.title || entry.content) // And it has content
        );
    if (newFilledEntries.length > 0) {
        changed = true;
        }
    }

    setHasUnsavedChanges(changed);

  }, [
      customAntragPrompt, 
      customSocialPrompt, 
      knowledgeEntries, 
      queryData, // Depends on fetched data for comparison
      isLoadingQuery, // Don't run while loading
      initialDataLoaded.current // Ensure initial data is loaded
    ]);

  // --- Input Handlers (remain largely the same, update local state) --- 
  const handleAnweisungenChange = useCallback((field, value) => {
    if (!initialDataLoaded.current) return; // Prevent changes before init
    if (field === 'customAntragPrompt') setCustomAntragPrompt(value);
    else if (field === 'customSocialPrompt') setCustomSocialPrompt(value);
  }, []);

  const handleKnowledgeChange = useCallback((id, field, value) => {
    if (!initialDataLoaded.current) return; // Prevent changes before init
    // Ensure content doesn't exceed max length
    if (field === 'content' && value.length > MAX_CONTENT_LENGTH) {
        value = value.substring(0, MAX_CONTENT_LENGTH);
    }
    setKnowledgeEntries(prevEntries =>
      prevEntries.map(entry => 
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  }, []);

  // --- React Query: Save Mutation --- 
  const saveMutationFn = async () => {
    if (!user?.id || !templatesSupabase) throw new Error("User or Supabase client not available.");
    if (!queryData) throw new Error("Initial data not loaded yet."); // Should not happen if button is disabled

    console.log("[RQ Mutate Save] Saving changes...");
    
    const profileUpdatePayload = {};
      let anweisungenChanged = false;
      
      // Check and prepare Anweisungen update
    if (customAntragPrompt !== queryData.antragPrompt) {
        profileUpdatePayload.custom_antrag_prompt = customAntragPrompt;
        anweisungenChanged = true;
      }
    if (customSocialPrompt !== queryData.socialPrompt) {
        profileUpdatePayload.custom_social_prompt = customSocialPrompt;
        anweisungenChanged = true;
      }

    // --- DB Operations --- 
    const promises = [];

    // 1. Update Profile (Anweisungen) if changed
      if (anweisungenChanged) {
        profileUpdatePayload.updated_at = new Date();
      promises.push(
        templatesSupabase
          .from('profiles')
          .update(profileUpdatePayload)
          .eq('id', user.id)
      );
      console.log("[RQ Mutate Save] Profile update queued.");
    }

    // 2. Process Knowledge Entries (Updates, Inserts, Deletes)
    const initialKnowledgeMap = new Map(queryData.knowledge.map(e => [e.id, cleanKnowledgeEntry(e)]));
    const currentKnowledgeCleaned = knowledgeEntries.map(cleanKnowledgeEntry);

    for (const currentEntry of currentKnowledgeCleaned) {
       const initialEntry = currentEntry.id ? initialKnowledgeMap.get(currentEntry.id) : null;
       const hasContent = currentEntry.title || currentEntry.content;

       if (currentEntry.id) { // Existing or previously existing entry
         if (!initialEntry) continue; // Should not happen if logic is correct

         const wasModified = currentEntry.title !== initialEntry.title || currentEntry.content !== initialEntry.content;
         const isEmptyNow = !hasContent;
         const wasNotEmpty = initialEntry.title || initialEntry.content;

         if (wasModified && hasContent) {
            // Update existing entry
             if (currentEntry.content.length > MAX_CONTENT_LENGTH) {
                 throw new Error(`Wissen (ID: ${currentEntry.id}): Inhalt zu lang.`);
             }
            console.log(`[RQ Mutate Save] Knowledge update queued for ID: ${currentEntry.id}`);
             promises.push(
                templatesSupabase
               .from('user_knowledge')
                   .update({ title: currentEntry.title || 'Unbenannter Eintrag', content: currentEntry.content, updated_at: new Date() })
                   .eq('id', currentEntry.id)
               .eq('user_id', user.id)
             );
         } else if (isEmptyNow && wasNotEmpty) {
            // Delete existing entry because it became empty
            console.log(`[RQ Mutate Save] Knowledge delete queued for ID: ${currentEntry.id} (became empty).`);
             promises.push(
                templatesSupabase
                    .from('user_knowledge')
                    .delete()
                    .match({ id: currentEntry.id, user_id: user.id })
             );
         }
       } else if (hasContent) {
            // Insert new entry (it was a placeholder and now has content)
              if (currentEntry.content.length > MAX_CONTENT_LENGTH) {
                 throw new Error(`Neues Wissen: Inhalt zu lang.`);
             }
            console.log(`[RQ Mutate Save] Knowledge insert queued.`);
             promises.push(
               templatesSupabase
               .from('user_knowledge')
                 .insert({ user_id: user.id, title: currentEntry.title || 'Unbenannter Eintrag', content: currentEntry.content })
             );
       }
    }
    
    // --- Execute all DB operations --- 
    const results = await Promise.all(promises);

    // Check for errors in results (Supabase might return an object with an error property)
    results.forEach(result => {
        if (result && result.error) {
            console.error("[RQ Mutate Save] DB operation error:", result.error);
            // Throw the first encountered error
            throw new Error(`Fehler bei Datenbankoperation: ${result.error.message}`);
        }
    });

    console.log("[RQ Mutate Save] All DB operations successful.");
    return results; // Return data if needed, otherwise just success confirmation
  };

  const { 
    mutate: saveChanges, 
    isLoading: isSaving, 
    isSuccess: isSaveSuccess, 
    isError: isSaveError, 
    error: saveError 
  } = useMutation(
    {
      mutationFn: saveMutationFn,
      onSuccess: () => {
        console.log("[RQ Mutate Save] Success! Invalidating query...");
        // Invalidate the query to refetch fresh data from the server
        queryClient.invalidateQueries(queryKey);
        // After successful save and invalidation/refetch, reset the unsaved changes flag
        // The useEffect listening to queryData will handle resetting local state if needed
        setHasUnsavedChanges(false); 
        initialDataLoaded.current = false; // Allow re-initialization after refetch
      },
      onError: (err) => {
        console.error("[RQ Mutate Save] Error:", err);
        // Error state is managed by isSaveError and saveError
      },
    }
  );

  // --- React Query: Delete Knowledge Mutation --- 
  const deleteKnowledgeMutationFn = async (entryId) => {
    if (!user?.id || !templatesSupabase) throw new Error("User or Supabase client not available.");
    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
        console.log("[RQ Mutate Delete] Ignored deletion of unsaved new entry.");
        return; // Don't delete unsaved placeholders from DB
    }
    
    console.log(`[RQ Mutate Delete] Deleting knowledge ID: ${entryId}`);
    const { error: deleteError } = await templatesSupabase
      .from('user_knowledge')
      .delete()
      .match({ id: entryId, user_id: user.id });

    if (deleteError) {
      throw new Error(`Fehler beim Löschen von Wissen ${entryId}: ${deleteError.message}`);
    }
    return entryId; // Return deleted ID for potential UI updates
  };

  const { 
    mutate: deleteKnowledgeEntry, 
    isLoading: isDeletingKnowledge, 
    variables: deletingKnowledgeId, // Access the entryId passed to mutate
    isError: isDeleteKnowledgeError,
    error: deleteKnowledgeError
  } = useMutation(
    {
      mutationFn: deleteKnowledgeMutationFn,
      onSuccess: (deletedEntryId) => {
        console.log(`[RQ Mutate Delete] Success for ID: ${deletedEntryId}! Invalidating query...`);
        // Invalidate the main query to get fresh data
        queryClient.invalidateQueries(queryKey);
        // Also remove the deleted entry from local state immediately for better UX
        // or wait for the refetch triggered by invalidation.
        // Let's rely on invalidation + the useEffect that resets state.
        setHasUnsavedChanges(false); // Reset flag, assuming deletion is intended
        initialDataLoaded.current = false; // Allow re-initialization after refetch
      },
      onError: (err) => {
        console.error("[RQ Mutate Delete] Error:", err);
      },
    }
  );

  // --- Delete Handler (calls the mutation) --- 
   const handleKnowledgeDelete = useCallback((entryId) => {
        if (isDeletingKnowledge) return; // Prevent parallel deletes for the same item

        // If it's a placeholder ('new-...') just clear it locally without DB call/mutation
        if (typeof entryId === 'string' && entryId.startsWith('new-')) {
            setKnowledgeEntries(prevEntries =>
                prevEntries.map(entry =>
                  entry.id === entryId 
                    ? { id: `new-${Date.now()}-${Math.random()}`, title: '', content: '', isNew: true } // Replace with new placeholder
                    : entry
                )
            );
             // The useEffect for hasUnsavedChanges will handle recalculation.
            return;
        }

        // Existing entry deletion - confirmation before calling mutation
        if (!window.confirm("Möchtest du diesen Wissenseintrag wirklich löschen?")) {
            return;
        }

        deleteKnowledgeEntry(entryId);

   }, [deleteKnowledgeEntry, isDeletingKnowledge]);


   // Return values needed by ProfilePage
   return {
      // Local state for forms
      customAntragPrompt,
      customSocialPrompt,
      knowledgeEntries,
      
      // Input handlers
      handleAnweisungenChange,
      handleKnowledgeChange,
      handleKnowledgeDelete, // Use this modified handler

      // Save action
      saveChanges, // Call this function to trigger the save mutation
      isSaving, // Loading state for the save operation
      isSaveSuccess, // Success state for save
      isSaveError, // Error state for save
      saveError, // Error object for save

      // Delete action status (specific entry deletion)
      isDeletingKnowledge, // True if a delete mutation is in progress
      deletingKnowledgeId, // The ID of the entry currently being deleted
      isDeleteKnowledgeError,
      deleteKnowledgeError,

      // Data fetching status (useQuery)
      queryData, // Raw data from the successful query
      isLoadingQuery, // Initial load state
      isFetchingQuery, // Background fetching state
      isErrorQuery, // Error state for fetching
      errorQuery, // Error object for fetching
      isSuccessQuery, // Success state for fetching

      // Other states
      hasUnsavedChanges,
      MAX_CONTENT_LENGTH // Export constant
   };
}; 