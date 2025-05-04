import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '../../context/SupabaseAuthContext';

/**
 * Hook für die Verwaltung von Wissenseinheiten
 * Lädt verfügbare Wissenseinheiten aus der DB und verwaltet ausgewählte Einheiten
 */
const useKnowledge = () => {
  const { user } = useSupabaseAuth();
  const [availableKnowledge, setAvailableKnowledge] = useState([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Laden der verfügbaren Wissenseinheiten
  const loadAvailableKnowledge = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const module = await import('../utils/templatesSupabaseClient');
      if (!module.templatesSupabase) {
        throw new Error('Templates Supabase client not available');
      }
      
      const { templatesSupabase } = module;
      
      // Lade die Wissenseinheiten des Benutzers
      const { data, error } = await templatesSupabase
        .from('user_knowledge')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setAvailableKnowledge(data || []);
    } catch (err) {
      console.error('Fehler beim Laden der Wissenseinheiten:', err);
      setError('Wissenseinheiten konnten nicht geladen werden');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Effekt zum Laden der Wissenseinheiten beim ersten Rendering
  useEffect(() => {
    if (user) {
      loadAvailableKnowledge();
    }
  }, [user, loadAvailableKnowledge]);

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
    
    // Kombiniere den Inhalt aller ausgewählten Wissenseinheiten
    return selectedKnowledge.map(item => {
      return `## ${item.title}\n${item.content}`;
    }).join('\n\n');
  }, [selectedKnowledge]);

  return {
    availableKnowledge,
    selectedKnowledge,
    isLoading,
    error,
    handleKnowledgeSelection,
    clearSelectedKnowledge,
    getKnowledgeContent,
    refreshKnowledge: loadAvailableKnowledge
  };
};

export default useKnowledge; 