import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { HiShieldCheck } from 'react-icons/hi';
import PropTypes from 'prop-types';
// import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import BaseForm from '../../../components/common/BaseForm';
// FormContext removed - using generatedTextStore directly
import ErrorBoundary from '../../../components/ErrorBoundary';
import TextTypeSelector, { TEXT_TYPES, TEXT_TYPE_TITLES } from './components/TextTypeSelector';
import RedeForm from './RedeForm';
import WahlprogrammForm from './WahlprogrammForm';
import UniversalForm from './UniversalForm';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { HiGlobeAlt } from 'react-icons/hi';

const API_ENDPOINTS = {
  [TEXT_TYPES.REDE]: '/claude_rede',
  [TEXT_TYPES.WAHLPROGRAMM]: '/claude_wahlprogramm',
  [TEXT_TYPES.UNIVERSAL]: '/claude_universal'
};

const UniversalTextGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'universal-text';
  const [selectedType, setSelectedType] = useState(TEXT_TYPES.UNIVERSAL);
  const [generatedContent, setGeneratedContent] = useState('');
  const [useWebSearchTool, setUseWebSearchTool] = useState(false);
  const [usePrivacyMode, setUsePrivacyMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);
  const formRef = useRef();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  
  useOptimizedAuth();
  
  // Initialize knowledge system with UI configuration
  useKnowledge({ 
    instructionType: 'universal', 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('UNIVERSAL');
  const baseFormTabIndex = useBaseFormTabIndex('UNIVERSAL');
  
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
    instructionType: 'universal',
    groupDetailsData,
    availableKnowledge,
  });
  
  // const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit(API_ENDPOINTS[selectedType]);

  useEffect(() => {
    setStoreIsLoading(loading);
  }, [loading, setStoreIsLoading]);

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData) return;
    
    const formData = formRef.current.getFormData();
    if (!formData) return;

    // Add web search, privacy mode and attachments to form data
    formData.useWebSearchTool = useWebSearchTool;
    formData.usePrivacyMode = usePrivacyMode;
    formData.attachments = processedAttachments;

    try {
      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        
        // Extract key fields that provide context
        if (data.thema) queryParts.push(data.thema);
        if (data.hauptthema) queryParts.push(data.hauptthema);
        if (data.anliegen) queryParts.push(data.anliegen);
        if (data.topic) queryParts.push(data.topic);
        if (data.subject) queryParts.push(data.subject);
        if (data.zielgruppe) queryParts.push(data.zielgruppe);
        if (data.context) queryParts.push(data.context);
        if (data.beschreibung) queryParts.push(data.beschreibung);
        if (data.inhalt) queryParts.push(data.inhalt);
        
        return queryParts.filter(part => part && part.trim()).join(' ');
      };
      
      const searchQuery = extractQueryFromFormData(formData);
      console.log('[UniversalTextGenerator] Extracted search query from form:', searchQuery);

      // Add knowledge, instructions, and documents with intelligent extraction
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'universal',
        groupDetailsData,
        getKnowledgeContent,
        getDocumentContent,
        memoryOptions: {
          enableMemories: false, // Not using memories in this context
          query: searchQuery
        }
      });
      
      if (finalPrompt) {
        formData.customPrompt = finalPrompt;
        console.log('[UniversalTextGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[UniversalTextGenerator] No custom instructions or knowledge for generation.');
      }
      
      const content = await submitForm(formData);
      if (content) {
        setGeneratedContent(content);
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  }, [submitForm, resetSuccess, setGeneratedText, selectedType, componentName, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent, useWebSearchTool, usePrivacyMode, processedAttachments]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      console.log(`[UniversalTextGenerator] Processing ${files.length} new attached files`);
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
      
      console.log('[UniversalTextGenerator] Files successfully processed for submission');
    } catch (error) {
      console.error('[UniversalTextGenerator] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    console.log(`[UniversalTextGenerator] Removing file at index ${index}`);
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const helpContent = {
    content: "Der Universal Text Grünerator erstellt verschiedene Textarten - von Reden über Wahlprogramme bis hin zu allgemeinen Texten. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.",
    tips: [
      "Wähle zunächst den passenden Texttyp aus",
      "Reden: Perfekt für Veranstaltungen und öffentliche Auftritte",
      "Wahlprogramme: Strukturierte politische Inhalte",
      "Universal: Für alle anderen Textarten geeignet",
      "Hänge PDFs oder Bilder als Kontext an (max. 5MB pro Datei)",
      "Gib spezifische Details für bessere Ergebnisse an"
    ]
  };

  const webSearchFeatureToggle = {
    isActive: useWebSearchTool,
    onToggle: (checked) => {
      setUseWebSearchTool(checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "",
    tabIndex: tabIndex.webSearch || 11
  };

  const privacyModeToggle = {
    isActive: usePrivacyMode,
    onToggle: (checked) => {
      setUsePrivacyMode(checked);
    },
    label: "Privacy-Mode",
    icon: HiShieldCheck,
    description: "Verwendet deutsche Server der Netzbegrünung.",
    tabIndex: tabIndex.privacyMode || 13
  };

  const renderForm = () => {
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm ref={formRef} tabIndex={tabIndex} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return <WahlprogrammForm ref={formRef} tabIndex={tabIndex} />;
      case TEXT_TYPES.UNIVERSAL:
        return <UniversalForm ref={formRef} tabIndex={tabIndex} />;
      default:
        return null;
    }
  };

  const renderTextTypeSection = () => (
    <TextTypeSelector 
      selectedType={selectedType}
      onTypeChange={setSelectedType}
    />
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={TEXT_TYPE_TITLES[selectedType]}
          loading={loading}
          success={success}
          error={error}
          generatedContent={generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSubmit={handleSubmit}
          formNotice={formNotice}
          helpContent={helpContent}
          componentName={componentName}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={true}
          privacyModeToggle={privacyModeToggle}
          usePrivacyModeToggle={true}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          firstExtrasChildren={renderTextTypeSection()}
          platformSelectorTabIndex={baseFormTabIndex.platformSelectorTabIndex}
          knowledgeSelectorTabIndex={baseFormTabIndex.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={baseFormTabIndex.knowledgeSourceSelectorTabIndex}
          documentSelectorTabIndex={baseFormTabIndex.documentSelectorTabIndex}
          submitButtonTabIndex={baseFormTabIndex.submitButtonTabIndex}
        >
          {renderForm()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

UniversalTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default UniversalTextGenerator; 