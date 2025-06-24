import React, { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import StyledCheckbox from '../../../components/common/AnimatedCheckbox';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiInformationCircle, HiGlobeAlt } from 'react-icons/hi';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import AntragSavePopup from './components/AntragSavePopup';
import { saveAntrag } from './antragSaveUtils';

const AntragGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'antrag-generator';
  const { user } = useOptimizedAuth();
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Initialize knowledge system with document preloading
  useKnowledge({ instructionType: 'antrag', enableDocuments: true });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('ANTRAG');
  const baseFormTabIndex = useBaseFormTabIndex('ANTRAG');

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      idee: '',
      details: '',
      gliederung: '',
      useWebSearchTool: false
    }
  });

  const watchUseWebSearch = watch('useWebSearchTool');

  const [antragContent, setAntragContent] = useState('');
  const [isSavePopupOpen, setIsSavePopupOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    isInstructionsActive,
    instructions,
    getKnowledgeContent,
    getDocumentContent,
    getActiveInstruction,
    groupData: groupDetailsData
  } = useGeneratorKnowledgeStore();
  
  // Create form notice
  const formNotice = createKnowledgeFormNotice({
    source,
    isLoadingGroupDetails: false, // useKnowledge handles loading
    isInstructionsActive,
    instructions,
    instructionType: 'antrag',
    groupDetailsData,
    availableKnowledge,
  });

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
      const formDataToSubmit = {
        idee: rhfData.idee,
        details: rhfData.details,
        gliederung: rhfData.gliederung,
        useWebSearchTool: rhfData.useWebSearchTool
      };
      
      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.idee) queryParts.push(data.idee);
        if (data.details) queryParts.push(data.details);
        if (data.gliederung) queryParts.push(data.gliederung);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };
      
      const searchQuery = extractQueryFromFormData(formDataToSubmit);
      console.log('[AntragGenerator] Extracted search query from form:', searchQuery);

      // Add knowledge, instructions, and documents
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'antrag',
        groupDetailsData,
        getKnowledgeContent,
        getDocumentContent,
        memoryOptions: {
          enableMemories: false, // Not using memories in this context
          query: searchQuery
        }
      });
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt; 
        console.log('[AntragGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[AntragGenerator] No custom instructions or knowledge for generation.');
      }

      const content = await submitForm(formDataToSubmit);
      if (content) {
        setAntragContent(content);
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (submitError) {
      console.error('[AntragGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, componentName, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setAntragContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleSaveToDb = useCallback(async () => {
    setIsSavePopupOpen(true);
  }, []);

  const handleConfirmSave = useCallback(async (popupData) => {
    setIsSavePopupOpen(false);
    setIsSaving(true);
    
    try {
      const payload = {
        title: popupData.title || watch('idee') || 'Unbenannter Antrag',
        antragstext: storeGeneratedText || antragContent,
        gliederung: watch('gliederung') || '',
        ...popupData,
      };
      await saveAntrag(payload);
    } catch (saveError) {
      console.error('[AntragGenerator] Error during final save of antrag:', saveError);
    } finally {
      setIsSaving(false);
    }
  }, [watch, storeGeneratedText, antragContent]);


  const helpContent = {
    content: "Dieser Grünerator erstellt strukturierte Anträge für politische Gremien basierend auf deiner Idee und den Details.",
    tips: [
      "Formuliere deine Idee klar und präzise",
      "Füge ausführliche Begründungen hinzu",
      "Optional: Gib eine gewünschte Gliederung vor",
      "Nutze die Websuche für aktuelle Informationen",
      "Speichere wichtige Anträge in der Datenbank"
    ]
  };

  const renderFormInputs = () => (
    <>
      <Input
        name="idee"
        control={control}
        label={FORM_LABELS.IDEE}
        placeholder={FORM_PLACEHOLDERS.IDEE}
        rules={{ required: 'Idee ist ein Pflichtfeld' }}
        tabIndex={tabIndex.idee}
      />

      <Textarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        className="form-textarea-large"
        tabIndex={tabIndex.details}
      />

      <Input
        name="gliederung"
        control={control}
        label={FORM_LABELS.GLIEDERUNG}
        placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
        tabIndex={tabIndex.gliederung}
      />
    </>
  );
  
  const webSearchFeatureToggle = {
    isActive: watchUseWebSearch,
    onToggle: (checked) => {
      setValue('useWebSearchTool', checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "Nutzt aktuelle Informationen aus dem Web für den Antrag.",
    tabIndex: tabIndex.webSearch
  };

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Grünerator für Anträge"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || antragContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSave={handleSaveToDb}
          saveLoading={isSaving}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          helpContent={helpContent}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={true}
          componentName={componentName}
          platformSelectorTabIndex={baseFormTabIndex.platformSelectorTabIndex}
          knowledgeSelectorTabIndex={baseFormTabIndex.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={baseFormTabIndex.knowledgeSourceSelectorTabIndex}
          documentSelectorTabIndex={baseFormTabIndex.documentSelectorTabIndex}
          submitButtonTabIndex={baseFormTabIndex.submitButtonTabIndex}
        >
          {renderFormInputs()}
        </BaseForm>
        
        <AntragSavePopup
          isOpen={isSavePopupOpen}
          onClose={() => setIsSavePopupOpen(false)}
          onConfirm={handleConfirmSave}
          isSaving={isSaving}
          antragstext={storeGeneratedText || antragContent}
          initialData={{ title: watch('idee') }}
        />
      </div>
    </ErrorBoundary>
  );
};

AntragGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default AntragGenerator;