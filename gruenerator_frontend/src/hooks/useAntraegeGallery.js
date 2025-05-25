import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient.js';

const DEBOUNCE_DELAY = 500;

export const useAntraegeGallery = (searchTermExternal, selectedCategoryExternal, searchModeExternal) => {
  const searchModeRef = useRef(searchModeExternal);

  // Aktualisiere Ref bei Änderung des searchModeExternal
  if (searchModeRef.current !== searchModeExternal) {
    searchModeRef.current = searchModeExternal;
  }

  // Kategorien laden
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError
  } = useQuery({
    queryKey: ['antraegeCategories'],
    queryFn: async () => {
      const { data, error } = await templatesSupabase
        .from('antraege_categories')
        .select('id, label')
        .order('label');
      
      if (error) throw error;
      return [{ id: 'all', label: 'Alle Kategorien' }, ...(data || [])];
    },
  });

  // Anträge laden mit Filtern
  const {
    data: antraege,
    isLoading: antraegeLoading,
    isFetching: antraegeFetching,
    error: antraegeError,
    refetch: refetchAntraege
  } = useQuery({
    queryKey: ['antraege', searchTermExternal, selectedCategoryExternal, searchModeExternal],
    queryFn: async () => {
      const currentSearchMode = searchModeRef.current;
      
      let query = templatesSupabase
        .from('antraege')
        .select(`
          id, 
          user_id, 
          template_id, 
          title, 
          status, 
          antragstext, 
          description,
          gliederung,
          antragsteller,
          kontakt_email,
          kontakt_erlaubt,
          created_at, 
          updated_at,
          antraege_to_categories!left(
            category_id,
            antraege_categories (
              id,
              label
            )
          ),
          antraege_to_tags!left(
            tag_id,
            antraege_tags ( 
              id,
              label
            )
          )
        `);

      // Suchfilter anwenden
      if (searchTermExternal) {
        const searchPattern = `%${searchTermExternal}%`;
        switch (currentSearchMode) {
          case 'title':
            query = query.ilike('title', searchPattern);
            break;
          case 'fulltext':
            query = query.or(`title.ilike.${searchPattern},antragstext.ilike.${searchPattern}`);
            break;
          case 'semantic':
            query = query.ilike('title', searchPattern); // Fallback zur Titelsuche
            break;
          default:
            query = query.ilike('title', searchPattern);
        }
      }

      // Abfrage durchführen
      const { data: antraegeData, error: antraegeError } = await query.order('created_at', { ascending: false });
      
      if (antraegeError) throw antraegeError;

      // Kategoriefilterung clientseitig anwenden
      let filteredAntraegeData = antraegeData || [];
      if (selectedCategoryExternal !== 'all') {
        const categoryIdNumber = parseInt(selectedCategoryExternal, 10);
        if (!isNaN(categoryIdNumber)) {
          filteredAntraegeData = filteredAntraegeData.filter(antrag => 
            antrag.antraege_to_categories?.some(jtc => jtc?.antraege_categories?.id === categoryIdNumber)
          );
        }
      }

      // Daten transformieren: Tags extrahieren
      return filteredAntraegeData.map(antrag => {
        const tags = antrag.antraege_to_tags 
          ? antrag.antraege_to_tags
              .filter(jtt => jtt && jtt.antraege_tags && typeof jtt.antraege_tags.label !== 'undefined') 
              .map(jtt => jtt.antraege_tags.label) 
          : [];
        
        const categories = antrag.antraege_to_categories
          ? antrag.antraege_to_categories
              .filter(jtc => jtc && jtc.antraege_categories && typeof jtc.antraege_categories.label !== 'undefined')
              .map(jtc => ({ id: jtc.antraege_categories.id, label: jtc.antraege_categories.label }))
          : [];

        return {
          ...antrag, 
          tags, 
          categories, 
          antraege_to_tags: undefined, 
          antraege_to_categories: undefined,
        };
      });
    },
    enabled: true,
  });

  return {
    // Daten
    antraege: antraege || [],
    categories: categories || [{ id: 'all', label: 'Alle Kategorien' }],
    
    // Status
    loading: antraegeLoading || categoriesLoading || antraegeFetching,
    error: antraegeError || categoriesError,
    
    // Actions
    refetchAntraege
  };
}; 