import { useState, useCallback } from 'react';
import { useSupabaseAuth } from '../../context/SupabaseAuthContext';
import { useQuery } from '@tanstack/react-query';
import { templatesSupabase as supabase } from '../utils/templatesSupabaseClient'; // Direct import

const EMPTY_ARRAY = []; // Stable empty array reference

/**
 * Hook für die Verwaltung von Wissenseinheiten
 * Lädt verfügbare Wissenseinheiten aus der DB und verwaltet ausgewählte Einheiten
 */
const useKnowledge = () => {
  const { user } = useSupabaseAuth();
  // selectedKnowledge bleibt client-seitiger State
  const [selectedKnowledge, setSelectedKnowledge] = useState([]);

  const fetchUserKnowledge = async () => {
    if (!user) {
      return EMPTY_ARRAY; // Return stable empty array if user is not available
    }
    const { data, error } = await supabase
      .from('user_knowledge')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Fehler beim Laden der Wissenseinheiten:', error);
      throw new Error('Wissenseinheiten konnten nicht geladen werden');
    }
    return data || EMPTY_ARRAY; // Ensure stable array reference if data is null/undefined
  };

  const { 
    data: availableKnowledgeData, 
    isLoading, 
    error, 
    refetch: refreshKnowledge 
  } = useQuery({
    queryKey: ['userKnowledge', user?.id], 
    queryFn: fetchUserKnowledge,
    enabled: !!user, // Only run query if user is available
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  });

  // Hinzufügen oder Entfernen einer Wissenseinheit
  const handleKnowledgeSelection = useCallback((knowledge, knowledgeIdToRemove) => {
    if (knowledgeIdToRemove) {
      // Entfernen einer Wissenseinheit
      setSelectedKnowledge(prev => prev.filter(item => item.id !== knowledgeIdToRemove));
    } else if (knowledge) {
      // Hinzufügen einer Wissenseinheit
      setSelectedKnowledge(prev => [...prev, knowledge]);
    }
  }, []);

  // Alle ausgewählten Wissenseinheiten entfernen
  const clearSelectedKnowledge = useCallback(() => {
    setSelectedKnowledge([]);
  }, []);

  // Generiere den Wissensinhalt für API-Anfragen
  const getKnowledgeContent = useCallback(() => {
    if (selectedKnowledge.length === 0) return null;
    
    return selectedKnowledge.map(item => {
      return `## ${item.title}\n${item.content}`;
    }).join('\n\n');
  }, [selectedKnowledge]);

  return {
    availableKnowledge: availableKnowledgeData ?? EMPTY_ARRAY, // Use nullish coalescing for stable empty array
    selectedKnowledge,
    isLoading,
    error,
    handleKnowledgeSelection,
    clearSelectedKnowledge,
    getKnowledgeContent,
    refreshKnowledge
  };
};

export default useKnowledge; 