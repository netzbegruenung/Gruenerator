import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';

const LeichteSpracheGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'leichte-sprache';
  const { isAuthenticated } = useOptimizedAuth();
  const { Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Initialize knowledge system with UI configuration
  useKnowledge({ 
    instructionType: 'leichte_sprache', 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('LEICHTE_SPRACHE');
  const baseFormTabIndex = useBaseFormTabIndex('LEICHTE_SPRACHE');

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      originalText: '',
      targetLanguage: 'Deutsch',
      useWebSearchTool: false,
      usePrivacyMode: false
    }
  });

  const watchUseWebSearch = watch('useWebSearchTool');
  const watchUsePrivacyMode = watch('usePrivacyMode');

  const [translatedContent, setTranslatedContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);

  // URL crawler hook for automatic link processing
  const {
    crawledUrls,
    crawlingUrls,
    crawlErrors,
    detectAndCrawlUrls,
    removeCrawledUrl,
    retryUrl,
    isCrawling
  } = useUrlCrawler();

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls) => {
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), watchUsePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, watchUsePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
    await retryUrl(url, watchUsePrivacyMode);
  }, [retryUrl, watchUsePrivacyMode]);

  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/leichte_sprache');
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
    instructionType: 'leichte_sprache',
    groupDetailsData,
    availableKnowledge,
  });

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...processedAttachments,
        ...crawledUrls
      ];

      const formDataToSubmit = {
        originalText: rhfData.originalText,
        targetLanguage: rhfData.targetLanguage,
        useWebSearchTool: rhfData.useWebSearchTool,
        usePrivacyMode: rhfData.usePrivacyMode,
        attachments: allAttachments
      };
      
      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.originalText) queryParts.push(data.originalText);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };
      
      const searchQuery = extractQueryFromFormData(formDataToSubmit);

      // Add knowledge, instructions, and documents
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'leichte_sprache',
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
      }

      const response = await submitForm(formDataToSubmit);
      if (response) {
        // Handle both old string format and new {content, metadata} format
        const content = typeof response === 'string' ? response : response.content;
        const metadata = typeof response === 'object' ? response.metadata : {};
        
        if (content) {
          setTranslatedContent(content);
          setGeneratedText(componentName, content, metadata);
          setTimeout(resetSuccess, 3000);
        }
      }
    } catch (submitError) {
      console.error('[LeichteSpracheGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent, processedAttachments, crawledUrls]);

  const handleGeneratedContentChange = useCallback((content) => {
    setTranslatedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error('[LeichteSpracheGenerator] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const helpContent = {
    content: "Dieser Grünerator übersetzt Texte in Leichte Sprache. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.",
    tips: [
      "Füge den zu übersetzenden Text in das Textfeld ein",
      "Der Text wird automatisch nach den Regeln der Leichten Sprache übersetzt",
      "Die Regeln folgen dem Netzwerk Leichte Sprache e.V. (Neuauflage 2022)",
      "Die Übersetzung erfolgt in kurzen, klaren Sätzen",
      "Schwierige Wörter werden erklärt oder ersetzt"
    ]
  };

  const webSearchFeatureToggle = {
    isActive: watchUseWebSearch,
    onToggle: (checked) => {
      setValue('useWebSearchTool', checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "",
    tabIndex: tabIndex.webSearch || 11
  };

  const privacyModeToggle = {
    isActive: watchUsePrivacyMode,
    onToggle: (checked) => {
      setValue('usePrivacyMode', checked);
    },
    label: "Privacy-Mode",
    icon: HiShieldCheck,
    description: "Verwendet deutsche Server der Netzbegrünung.",
    tabIndex: tabIndex.privacyMode || 13
  };

  const renderFormInputs = () => (
    <>
      <Textarea
        name="originalText"
        control={control}
        label="Text für Leichte Sprache"
        placeholder="Gib hier den Text ein, der in Leichte Sprache übersetzt werden soll..."
        rules={{ required: 'Text ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.originalText}
        enableUrlDetection={true}
        onUrlsDetected={handleUrlsDetected}
      />
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Leichte Sprache Grünerator"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || translatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          formControl={control}
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

LeichteSpracheGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default LeichteSpracheGenerator;