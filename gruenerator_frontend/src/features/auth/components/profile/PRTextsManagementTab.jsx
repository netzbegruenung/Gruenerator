import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion } from "motion/react";
import { handleError } from '../../../../components/utils/errorHandling';
import PRTextForm from './PRTextForm'; // Import the new form
// import PRTextList from './PRTextList'; // To be created

// Auth Backend URL for API calls
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const PRTextsManagementTab = ({ user, onSuccessMessage, onErrorMessage, isActive }) => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'form'
  const [currentPRText, setCurrentPRText] = useState(null); // For editing

  const prTextsQueryKey = ['userPRTexts', user?.id];
  const prTextCategoriesQueryKey = ['prTextCategories'];
  const prTextTagsQueryKey = ['prTextTags'];

  // --- Fetch PR Texts ---
  const {
    data: prTexts = [],
    isLoading: isLoadingPRTexts,
    isError: isErrorPRTexts,
    error: errorPRTexts,
    refetch: refetchPRTexts,
  } = useQuery({
    queryKey: prTextsQueryKey,
    queryFn: async () => {
      if (!user?.id) throw new Error('User not available.');
      
      const response = await fetch(`${AUTH_BASE_URL}/auth/pr-texts`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PR texts: ${response.status}`);
      }
      
      const data = await response.json();
      return data.prTexts || [];
    },
    enabled: !!user?.id && isActive !== false,
    onError: (err) => handleError(err, onErrorMessage, 'Fehler beim Laden der PR-Texte.'),
  });

  // --- Fetch Categories ---
  const {
    data: categories = [],
    isLoading: isLoadingCategories,
  } = useQuery({
    queryKey: prTextCategoriesQueryKey,
    queryFn: async () => {
      const response = await fetch(`${AUTH_BASE_URL}/auth/pr-text-categories`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PR text categories: ${response.status}`);
      }
      
      const data = await response.json();
      return data.categories || [];
    },
    enabled: isActive !== false,
    staleTime: 5 * 60 * 1000,
    onError: (err) => handleError(err, onErrorMessage, 'Fehler beim Laden der PR-Text Kategorien.'),
  });

  // --- Fetch Tags ---
  const {
    data: tags = [],
    isLoading: isLoadingTags,
  } = useQuery({
    queryKey: prTextTagsQueryKey,
    queryFn: async () => {
      const response = await fetch(`${AUTH_BASE_URL}/auth/pr-text-tags`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PR text tags: ${response.status}`);
      }
      
      const data = await response.json();
      return data.tags || [];
    },
    enabled: isActive !== false,
    staleTime: 5 * 60 * 1000,
    onError: (err) => handleError(err, onErrorMessage, 'Fehler beim Laden der PR-Text Tags.'),
  });

  // --- Mutations (Create, Update, Delete) --- 
  // Placeholder for mutations - to be implemented based on useCanvaTemplates structure

  const { mutate: createPRText, isLoading: isCreating } = useMutation({ /* ... */ });
  // const { mutate: updatePRText, isLoading: isUpdating } = useMutation({ /* ... */ });

  // --- Update PR Text Mutation ---
  const { mutate: updatePRText, isLoading: isUpdatingPRText } = useMutation({
    mutationFn: async ({ prTextId, formData }) => {
      if (!user?.id || !prTextId) {
        throw new Error("Benutzer oder PR-Text-ID nicht verfügbar.");
      }

      const response = await fetch(`${AUTH_BASE_URL}/auth/pr-texts/${prTextId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update PR text: ${response.status}`);
      }

      const data = await response.json();
      return data.prText;
    },
    onSuccess: (updatedData) => {
      onSuccessMessage('Text erfolgreich aktualisiert.');
      onErrorMessage('');
      queryClient.invalidateQueries({ queryKey: prTextsQueryKey });
      // Potentially invalidate single item query if we had one
      // queryClient.invalidateQueries({ queryKey: ['userPRText', updatedData?.id] }); 
      setViewMode('list');
      setCurrentPRText(null);
    },
    onError: (error) => {
      handleError(error, onErrorMessage, 'Text konnte nicht aktualisiert werden.');
      onSuccessMessage('');
    },
  });

  // --- Delete PR Text Mutation ---
  const { mutate: deletePRText, isLoading: isDeletingSinglePRText, variables: deletingPRTextId } = useMutation({
    mutationFn: async (prTextId) => {
      if (!user?.id || !prTextId) {
        throw new Error("Benutzer oder PR-Text-ID nicht verfügbar.");
      }
      
      const response = await fetch(`${AUTH_BASE_URL}/auth/pr-texts/${prTextId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete PR text: ${response.status}`);
      }

      return prTextId;
    },
    onSuccess: (deletedId) => {
      onSuccessMessage('Text erfolgreich gelöscht.');
      onErrorMessage('');
      queryClient.invalidateQueries({ queryKey: prTextsQueryKey });
      // Optional: Wenn im Formularmodus und der gelöschte Text angezeigt wurde, zurück zur Liste
      if (viewMode === 'form' && currentPRText?.id === deletedId) {
        setViewMode('list');
        setCurrentPRText(null);
      }
    },
    onError: (error) => {
      handleError(error, onErrorMessage, 'Text konnte nicht gelöscht werden.');
      onSuccessMessage('');
    },
  });

  const handleShowForm = async (prText = null) => {
    onSuccessMessage('');
    onErrorMessage('');
    
    if (prText && prText.id) {
      // Fetch associated categories and tags for the PR text being edited
      try {
        const [categoriesResponse, tagsResponse] = await Promise.all([
          fetch(`${AUTH_BASE_URL}/auth/pr-texts/${prText.id}/categories`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }).then(res => res.ok ? res.json() : { categoryIds: [] }),
          fetch(`${AUTH_BASE_URL}/auth/pr-texts/${prText.id}/tags`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }).then(res => res.ok ? res.json() : { tagIds: [] })
        ]);

        const selectedCategoryIds = categoriesResponse.categoryIds || [];
        const selectedTagIds = tagsResponse.tagIds || [];
        
        // Map these IDs to the format react-select expects { value: id, label: name }
        // We already have all categories and tags loaded (categories, tags states)
        const preSelectedCategories = categories
          .filter(cat => selectedCategoryIds.includes(cat.id))
          .map(cat => ({ value: cat.id, label: cat.name }));
          
        const preSelectedTags = tags
          .filter(tag => selectedTagIds.includes(tag.id))
          .map(tag => ({ value: tag.id, label: tag.name }));

        setCurrentPRText({ 
          ...prText, 
          preSelectedCategories, // Add to the currentPRText state
          preSelectedTags 
        });

      } catch (error) {
        handleError(error, onErrorMessage, 'Fehler beim Laden der zugehörigen Kategorien/Tags.');
        setCurrentPRText(prText); // Fallback to prText without pre-selections
      }
    } else {
      setCurrentPRText(null); // For new PR Text, reset
    }
    setViewMode('form');
  };

  const handleCancelForm = () => {
    setViewMode('list');
    setCurrentPRText(null);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleSubmitForm = async (formData) => {
    // To be implemented: call createPRText or updatePRText
    // This will involve handling pr_texts, pr_texts_to_categories, and pr_texts_to_tags tables.
    // console.log('Submitting form...', formData);
    // onSuccessMessage('Aktion wird ausgeführt...'); // Placeholder
    
    if (currentPRText?.id) { 
      updatePRText({ prTextId: currentPRText.id, formData });
    } else {
      // createPRText(formData, { onSuccess: ..., onError: ...}); // To be implemented
      console.log('Create PR Text logic to be implemented', formData);
      onErrorMessage('Erstellen-Funktion noch nicht implementiert.')
    }
  };

  const handleDelete = async (prTextId) => {
    if (!window.confirm('Möchten Sie diesen PR-Text wirklich löschen?')) return;
    deletePRText(prTextId);
  };

  const isLoading = isLoadingPRTexts || isLoadingCategories || isLoadingTags;

  if (isLoading) {
    return <ProfileTabSkeleton type={viewMode === 'form' ? 'form' : 'list'} itemCount={3} />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {viewMode === 'list' && (
        <div className="pr-text-list-placeholder">
          <h3>Öffentlichkeitsarbeit</h3>
          {/* <button onClick={() => handleShowForm(null)} className="button primary" style={{marginBottom: 'var(--spacing-medium)'}}>Neuen PR-Text erstellen</button> */}
          {isErrorPRTexts && <div className="auth-error-message">{errorPRTexts?.message || 'Fehler beim Laden.'}</div>}
          {prTexts.length === 0 && !isErrorPRTexts && <p>Sie haben noch keine Texte für Öffentlichkeitsarbeit gespeichert.</p>}
          {prTexts.length > 0 && (
            <ul>
              {prTexts.map(text => (
                <li key={text.id} className="pr-text-item">
                  <span>{text.title} (Erstellt: {new Date(text.created_at).toLocaleDateString()})</span>
                  <div>
                    <button onClick={() => handleShowForm(text)} className="button pr-text-edit-button" disabled={isUpdatingPRText || (isDeletingSinglePRText && deletingPRTextId === text.id)}>Bearbeiten</button>
                    <button 
                        onClick={() => handleDelete(text.id)} 
                        className="button danger" 
                        disabled={isUpdatingPRText || (isDeletingSinglePRText && deletingPRTextId === text.id)}
                    >
                        {isDeletingSinglePRText && deletingPRTextId === text.id ? 'Löschen...' : 'Löschen'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* Placeholder for PRTextList component */}
        </div>
      )}

      {viewMode === 'form' && (
        <div className="pr-text-form-placeholder">
          <h3>{currentPRText ? 'Text bearbeiten' : 'Neuen Text erstellen'} (Formular)</h3>
          
          <PRTextForm 
            initialData={currentPRText} // Hier müssen wir die ausgewählten Kategorien/Tags noch laden und übergeben
            categories={categories || []}
            tags={tags || []}
            onSubmit={handleSubmitForm}
            onCancel={handleCancelForm}
            isLoading={isCreating || isUpdatingPRText}
          />
          
        </div>
      )}
    </motion.div>
  );
};

export default PRTextsManagementTab; 