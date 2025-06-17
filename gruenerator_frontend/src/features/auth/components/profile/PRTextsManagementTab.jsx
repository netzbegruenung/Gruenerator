import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion } from "motion/react";
import { templatesSupabaseUtils } from '../../../../components/utils/templatesSupabaseClient'; // Assuming this path
import { handleError } from '../../../../components/utils/errorHandling';
import PRTextForm from './PRTextForm'; // Import the new form
// import PRTextList from './PRTextList'; // To be created

const PRTextsManagementTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage, isActive }) => {
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
      if (!user?.id || !templatesSupabase) throw new Error('User or Supabase client not available.');
      return templatesSupabaseUtils.fetchData('pr_texts', {
        filter: { column: 'user_id', operator: 'eq', value: user.id },
        order: { column: 'created_at', options: { ascending: false } },
      });
    },
    enabled: !!user?.id && !!templatesSupabase && isActive !== false,
    onError: (err) => handleError(err, onErrorMessage, 'Fehler beim Laden der PR-Texte.'),
  });

  // --- Fetch Categories ---
  const {
    data: categories = [],
    isLoading: isLoadingCategories,
  } = useQuery({
    queryKey: prTextCategoriesQueryKey,
    queryFn: async () => {
      if (!templatesSupabase) throw new Error('Supabase client not available.');
      return templatesSupabaseUtils.fetchData('pr_text_categories', { order: { column: 'name' } });
    },
    enabled: !!templatesSupabase && isActive !== false,
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
      if (!templatesSupabase) throw new Error('Supabase client not available.');
      return templatesSupabaseUtils.fetchData('pr_text_tags', { order: { column: 'name' } });
    },
    enabled: !!templatesSupabase && isActive !== false,
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
      if (!user?.id || !prTextId || !templatesSupabase) {
        throw new Error("Benutzer, PR-Text-ID oder Supabase-Client nicht verfügbar.");
      }

      const { title, content, category_ids, tag_ids } = formData;

      // 1. Update pr_texts table
      const { data: updatedText, error: textUpdateError } = await templatesSupabaseUtils.updateData(
        'pr_texts',
        { title, content, updated_at: new Date().toISOString() },
        { id: prTextId, user_id: user.id }
      );
      if (textUpdateError) throw textUpdateError;

      // 2. Update categories (delete existing, then insert new)
      // Delete existing category associations
      await templatesSupabaseUtils.deleteData('pr_texts_to_categories', { pr_text_id: prTextId });
      // Insert new category associations
      if (category_ids && category_ids.length > 0) {
        const categoriesToInsert = category_ids.map(catId => ({ pr_text_id: prTextId, category_id: catId }));
        await templatesSupabaseUtils.insertData('pr_texts_to_categories', categoriesToInsert);
      }

      // 3. Update tags (delete existing, then insert new)
      // Delete existing tag associations
      await templatesSupabaseUtils.deleteData('pr_texts_to_tags', { pr_text_id: prTextId });
      // Insert new tag associations
      if (tag_ids && tag_ids.length > 0) {
        const tagsToInsert = tag_ids.map(tagId => ({ pr_text_id: prTextId, tag_id: tagId }));
        await templatesSupabaseUtils.insertData('pr_texts_to_tags', tagsToInsert);
      }
      
      return updatedText && updatedText.length > 0 ? updatedText[0] : null;
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
      if (!user?.id || !prTextId || !templatesSupabase) {
        throw new Error("Benutzer, PR-Text-ID oder Supabase-Client nicht verfügbar.");
      }
      // Gleichzeitiges Löschen aus pr_texts, pr_texts_to_categories und pr_texts_to_tags
      // Supabase löscht kaskadierend, wenn ON DELETE CASCADE bei den Foreign Keys gesetzt ist.
      // Wir müssen also nur aus pr_texts löschen.
      await templatesSupabaseUtils.deleteData('pr_texts', { id: prTextId, user_id: user.id });
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
          templatesSupabaseUtils.fetchData('pr_texts_to_categories', {
            filter: { column: 'pr_text_id', operator: 'eq', value: prText.id },
            select: 'category_id' // We only need the IDs
          }),
          templatesSupabaseUtils.fetchData('pr_texts_to_tags', {
            filter: { column: 'pr_text_id', operator: 'eq', value: prText.id },
            select: 'tag_id' // We only need the IDs
          })
        ]);

        const selectedCategoryIds = categoriesResponse.map(ct => ct.category_id);
        const selectedTagIds = tagsResponse.map(tt => tt.tag_id);
        
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