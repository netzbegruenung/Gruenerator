import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
// import { useDynamicTextSize } from '../../utils/commonFunctions';
import ErrorBoundary from '../../ErrorBoundary';
import { useFormFields } from '../../common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useKnowledge from '../../hooks/useKnowledge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useAuthStore } from '../../../stores/authStore';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';

const GrueneJugendGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const { user } = useOptimizedAuth();
  const { memoryEnabled } = useAuthStore();

  // Initialize knowledge system with UI configuration
  const instructionType = 'gruenejugend';
  useKnowledge({ 
    instructionType, 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('GRUENE_JUGEND');
  const baseFormTabIndex = useBaseFormTabIndex('GRUENE_JUGEND');
  
  // Get knowledge state from store
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
    instructionType,
    groupDetailsData,
    availableKnowledge,
  });

  const platformOptions = useMemo(() => [
    { id: 'instagram', label: 'Instagram' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'reelScript', label: 'Skript für Reels & Tiktoks' },
    { id: 'actionIdeas', label: 'Aktionsideen' }
  ], []);

  const defaultPlatforms = useMemo(() => {
    // Determine default platforms based on initial content
    if (initialContent?.platforms) {
      const selectedPlatforms = Object.keys(initialContent.platforms).filter(
        key => initialContent.platforms[key]
      );
      if (selectedPlatforms.length > 0) {
        return selectedPlatforms; // Return all selected platforms
      }
    }
    
    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      return ['instagram'];
    }
    
    return []; // No default selection
  }, [initialContent]);
  
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      platforms: defaultPlatforms
    }
  });

  // Use store for content management (no local state needed)
  const socialMediaContent = useGeneratedTextStore(state => state.getGeneratedText(componentName)) || '';
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_gruene_jugend');

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);
    try {
      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];

      const formDataToSubmit = { 
        thema: rhfData.thema, 
        details: rhfData.details, 
        platforms: selectedPlatforms
      };
      
      // Add knowledge, instructions, documents, and memories
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType,
        groupDetailsData,
        getKnowledgeContent,
        getDocumentContent,
        memoryOptions: {
          enableMemories: memoryEnabled,
          query: rhfData.thema,
          generatorType: 'gruenejugend',
          userId: user?.id
        }
      });
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt;
        console.log('[GrueneJugendGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[GrueneJugendGenerator] No custom instructions or knowledge for generation.');
      }

      console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formDataToSubmit);
      const content = await submitForm(formDataToSubmit);
      console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
      if (content) {
        console.log('[GrueneJugendGenerator] Setze generierten Content:', content.substring(0, 100) + '...');
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, memoryEnabled, user?.id, componentName]);

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('[GrueneJugendGenerator] Content Change Handler aufgerufen mit:', content?.substring(0, 100) + '...');
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const helpContent = {
    content: "Dieser Grünerator erstellt jugendgerechte Social Media Inhalte und Aktionsideen speziell für die Grüne Jugend.",
    tips: [
      "Wähle ein aktuelles, jugendrelevantes Thema",
      "Formuliere Details verständlich und ansprechend",
      "TikTok und Instagram sind besonders effektiv für junge Zielgruppen",
      "Aktionsideen helfen bei der praktischen Umsetzung",
      "Instagram Reels erreichen eine große Reichweite"
    ]
  };

  const renderFormInputs = () => (
    <>
      <Input
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={tabIndex.thema}
      />

      <Textarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        tabIndex={tabIndex.details}
      />
    </>
  );


  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Grüne Jugend"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          enablePlatformSelector={true}
          platformOptions={platformOptions}
          formControl={control}
          helpContent={helpContent}
          componentName={componentName}
          platformSelectorTabIndex={baseFormTabIndex.platformSelectorTabIndex}
          knowledgeSelectorTabIndex={baseFormTabIndex.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={baseFormTabIndex.knowledgeSourceSelectorTabIndex}
          documentSelectorTabIndex={baseFormTabIndex.documentSelectorTabIndex}
          submitButtonTabIndex={baseFormTabIndex.submitButtonTabIndex}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

GrueneJugendGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default GrueneJugendGenerator; 