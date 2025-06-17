import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCanvaTemplates } from '../../../templates/hooks/useCanvaTemplates';
import CanvaTemplateList from './canva_templates/CanvaTemplateList';
import CanvaTemplateForm from './canva_templates/CanvaTemplateForm';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { handleError } from '../../../../components/utils/errorHandling'; // Error handling utility

// Props: user, templatesSupabase, onSuccessMessage, onErrorMessage
// Die äußeren Container und Titel werden jetzt vom übergeordneten Tab (TexteVorlagenTab) verwaltet.
const CanvaTemplatesTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage, isActive }) => {
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'form'
  const [currentTemplateData, setCurrentTemplateData] = useState(null); // For editing

  const {
    fetchCanvaTemplates,
    createCanvaTemplate,
    isCreatingCanvaTemplate,
    updateCanvaTemplate,
    isUpdatingCanvaTemplate,
    deleteCanvaTemplate,
    isDeletingCanvaTemplate,
    fetchAvailableCategories,
    fetchAvailableTags,
  } = useCanvaTemplates();

  const queryKeyCanvaTemplates = ['canvaTemplates', user?.id];

  const {
    data: canvaTemplates = [],
    isLoading: isLoadingList,
    isError: isListError,
    error: listError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: queryKeyCanvaTemplates,
    queryFn: () => fetchCanvaTemplates(user?.id, templatesSupabase),
    enabled: !!user?.id && !!templatesSupabase && viewMode === 'list' && isActive !== false, 
    onError: (err) => {
      console.error('[CanvaTemplatesTab] Error fetching templates:', err);
      handleError(err, onErrorMessage, 'Fehler beim Laden der Vorlagen.');
    },
  });

  const {
    data: availableCategories,
    isLoading: isLoadingCategories,
    isError: isCategoriesError,
    error: categoriesError,
  } = useQuery({
    queryKey: ['availableCanvaCategories'],
    queryFn: () => fetchAvailableCategories(templatesSupabase),
    enabled: !!templatesSupabase && isActive !== false,
    staleTime: 5 * 60 * 1000,
    onError: (err) => {
      console.error('[CanvaTemplatesTab] Error fetching available categories:', err);
      handleError(err, onErrorMessage, 'Fehler beim Laden der Kategorien.');
    },
  });

  const {
    data: availableTags,
    isLoading: isLoadingTags,
    isError: isTagsError,
    error: tagsError,
  } = useQuery({
    queryKey: ['availableCanvaTags'],
    queryFn: () => fetchAvailableTags(templatesSupabase),
    enabled: !!templatesSupabase && isActive !== false,
    staleTime: 5 * 60 * 1000,
    onError: (err) => {
      console.error('[CanvaTemplatesTab] Error fetching available tags:', err);
      handleError(err, onErrorMessage, 'Fehler beim Laden der Tags.');
    },
  });

  const handleShowForm = (template = null) => {
    onSuccessMessage('');
    onErrorMessage('');
    setCurrentTemplateData(template);
    setViewMode('form');
  };

  const handleCancelForm = () => {
    setViewMode('list');
    setCurrentTemplateData(null);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleSubmitForm = async (formData) => {
    onSuccessMessage('');
    onErrorMessage('');
    try {
      if (currentTemplateData && currentTemplateData.id) {
        await updateCanvaTemplate({ 
          templateId: currentTemplateData.id, 
          templateData: formData, 
          templatesSupabaseInstance: templatesSupabase 
        }, {
          onSuccess: () => {
            onSuccessMessage('Vorlage erfolgreich aktualisiert!');
            setViewMode('list');
            refetchTemplates();
          },
          onError: (err) => {
            console.error('[CanvaTemplatesTab] Error updating template:', err);
            handleError(err, onErrorMessage, 'Vorlage konnte nicht aktualisiert werden.');
          }
        });
      } else {
        await createCanvaTemplate({ 
          templateData: formData, 
          templatesSupabaseInstance: templatesSupabase 
        }, {
          onSuccess: () => {
            onSuccessMessage('Vorlage erfolgreich erstellt!');
            setViewMode('list');
            refetchTemplates();
          },
          onError: (err) => {
            console.error('[CanvaTemplatesTab] Error creating template:', err);
            handleError(err, onErrorMessage, 'Vorlage konnte nicht erstellt werden.');
          }
        });
      }
    } catch (err) {
      console.error('[CanvaTemplatesTab] Fallback error during submit:', err);
      handleError(err, onErrorMessage, 'Ein Fehler ist beim Speichern aufgetreten.');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Möchten Sie diese Vorlage wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    onSuccessMessage('');
    onErrorMessage('');
    try {
      await deleteCanvaTemplate({ 
        templateId, 
        templatesSupabaseInstance: templatesSupabase 
      }, {
        onSuccess: () => {
          onSuccessMessage('Vorlage erfolgreich gelöscht!');
          refetchTemplates();
          if (viewMode === 'form' && currentTemplateData?.id === templateId) {
            setViewMode('list');
            setCurrentTemplateData(null);
          }
        },
        onError: (err) => {
          console.error('[CanvaTemplatesTab] Error deleting template:', err);
          handleError(err, onErrorMessage, 'Vorlage konnte nicht gelöscht werden.');
        }
      });
    } catch (err) {
        console.error('[CanvaTemplatesTab] Fallback error during delete:', err);
        handleError(err, onErrorMessage, 'Vorlage konnte nicht gelöscht werden.');
    }
  };

  useEffect(() => {
    if (viewMode === 'list' && templatesSupabase && user?.id && (isListError || !canvaTemplates || canvaTemplates.length === 0)) {
        // Potentially refetch, but be careful with loops. Current setup refetches on view change or CUD.
    }
  }, [viewMode, templatesSupabase, user, isListError, canvaTemplates, refetchTemplates]);

  const isProcessing = isCreatingCanvaTemplate || isUpdatingCanvaTemplate || isDeletingCanvaTemplate;
  const isLoadingFormData = isLoadingCategories || isLoadingTags;

  return (
    // Die äußeren Container wurden entfernt. Die Darstellung erfolgt jetzt im übergeordneten Tab.
    <>
      {isListError && viewMode === 'list' && (
        <div className="auth-error-message error-margin">
          {listError?.message || 'Fehler beim Laden der Vorlagen.'} 
          <button onClick={() => refetchTemplates()} className="retry-button">Erneut versuchen</button>
        </div>
      )}

      {isCategoriesError && viewMode === 'form' && (
        <div className="auth-error-message error-margin">
          {categoriesError?.message || 'Fehler beim Laden der Kategorien für das Formular.'} 
        </div>
      )}
      {isTagsError && viewMode === 'form' && (
        <div className="auth-error-message error-margin">
          {tagsError?.message || 'Fehler beim Laden der Tags für das Formular.'} 
        </div>
      )}

      {viewMode === 'list' && isLoadingList && (
        <ProfileTabSkeleton type="list" itemCount={4} />
      )}

      {viewMode === 'list' && !isLoadingList && (
        <CanvaTemplateList
          templates={canvaTemplates}
          onEdit={(templateToEdit) => { // Direkte Übergabe des Template-Objekts
            // const templateToEdit = canvaTemplates.find(t => t.id === id);
            handleShowForm(templateToEdit);
          }}
          onDelete={handleDeleteTemplate}
          onCreate={() => handleShowForm(null)}
          isLoadingList={isLoadingList}
          isProcessing={isProcessing}
        />
      )}

      {viewMode === 'form' && isLoadingFormData && (
        <ProfileTabSkeleton type="form" />
      )}

      {viewMode === 'form' && !isLoadingFormData && (
        <CanvaTemplateForm
          initialData={currentTemplateData}
          onSubmit={handleSubmitForm}
          onCancel={handleCancelForm}
          isLoading={isProcessing}
          availableCategories={availableCategories || []}
          availableTags={availableTags || []}
        />
      )}
    </>
  );
};

export default CanvaTemplatesTab; 