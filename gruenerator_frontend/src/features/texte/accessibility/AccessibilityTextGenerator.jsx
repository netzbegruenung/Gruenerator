import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { HiShieldCheck, HiGlobeAlt } from 'react-icons/hi';
import BaseForm from '../../../components/common/BaseForm';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import { prepareFilesForSubmission, fileToBase64 } from '../../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';

// Import components
import AltTextForm from './components/AltTextForm';
import LeichteSpracheForm from './components/LeichteSpracheForm';
import { convertCanvaDesignToBase64 } from './utils/canvaImageHelper';
import FormSelect from '../../../components/common/Form/Input/FormSelect';

// Define types and labels directly in this file
export const ACCESSIBILITY_TYPES = {
  ALT_TEXT: 'alt-text',
  LEICHTE_SPRACHE: 'leichte-sprache'
};

export const ACCESSIBILITY_TYPE_LABELS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Leichte Sprache'
};

export const ACCESSIBILITY_TYPE_TITLES = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Barrierefreiheit - Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Barrierefreiheit - Leichte Sprache'
};

// Import styles
import './styles/canva-selector.css';

const API_ENDPOINTS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: '/claude_alttext', // Update this to correct endpoint
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache'
};

const AccessibilityTextGenerator = ({ showHeaderFooter = true }) => {
  const [selectedType, setSelectedType] = useState(ACCESSIBILITY_TYPES.ALT_TEXT);
  const [generatedContent, setGeneratedContent] = useState('');
  const [useWebSearchTool, setUseWebSearchTool] = useState(false);
  const [usePrivacyMode, setUsePrivacyMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);
  const formRef = useRef();
  const [searchParams] = useSearchParams();
  
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  
  useOptimizedAuth();
  
  // Dynamic component name based on selected type
  const componentName = `accessibility-${selectedType}`;
  
  // Initialize knowledge system with UI configuration - disabled for accessibility generator
  const instructionType = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'alttext' : 'leichte_sprache';
  useKnowledge({ 
    instructionType, 
    ui: {
      enableKnowledge: false,
      enableDocuments: false,
      enableTexts: false
    }
  });

  // Initialize tabIndex configuration
  const tabIndexKey = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'ALT_TEXT' : 'LEICHTE_SPRACHE';
  const tabIndex = useTabIndex(tabIndexKey);
  const baseFormTabIndex = useBaseFormTabIndex(tabIndexKey);
  
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
    isLoadingGroupDetails: false,
    isInstructionsActive,
    instructions,
    instructionType,
    groupDetailsData,
    availableKnowledge,
  });

  // Hooks for different functionality
  const {
    loading: altTextLoading,
    success: altTextSuccess,
    error: altTextError,
    generateAltTextForImage,
    resetSuccess: resetAltTextSuccess
  } = useAltTextGeneration();

  const { 
    submitForm: submitLeichteSprache, 
    loading: leichteSpracheLoading, 
    success: leichteSpracheSuccess, 
    resetSuccess: resetLeichteSpracheSuccess, 
    error: leichteSpracheError 
  } = useApiSubmit(API_ENDPOINTS[ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]);

  // URL crawler hook for Leichte Sprache
  const {
    crawledUrls,
    crawlingUrls,
    crawlErrors,
    detectAndCrawlUrls,
    removeCrawledUrl,
    retryUrl,
    isCrawling
  } = useUrlCrawler();

  // Handle URL detection and crawling for Leichte Sprache
  const handleUrlsDetected = useCallback(async (urls) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE && !isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode, selectedType]);

  // Handle URL retry for Leichte Sprache
  const handleRetryUrl = useCallback(async (url) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
      await retryUrl(url, usePrivacyMode);
    }
  }, [retryUrl, usePrivacyMode, selectedType]);

  // Derived state based on selected type
  const loading = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? altTextLoading : leichteSpracheLoading;
  const success = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? altTextSuccess : leichteSpracheSuccess;
  const error = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? altTextError : leichteSpracheError;
  const resetSuccess = selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? resetAltTextSuccess : resetLeichteSpracheSuccess;

  useEffect(() => {
    setStoreIsLoading(loading);
  }, [loading, setStoreIsLoading]);

  // Handle pre-selected Canva template from URL parameters (Alt-Text only)
  useEffect(() => {
    if (selectedType !== ACCESSIBILITY_TYPES.ALT_TEXT) return;
    
    const canvaTemplateParam = searchParams.get('canvaTemplate');
    if (canvaTemplateParam) {
      try {
        const sessionData = sessionStorage.getItem(canvaTemplateParam);
        if (sessionData) {
          const parsedData = JSON.parse(sessionData);
          
          if (parsedData.source === 'canvaTemplate' && parsedData.template) {
            console.log('[AccessibilityTextGenerator] Pre-selecting Canva template from URL:', parsedData.template.title);
            
            // Set the Canva design in the form
            if (formRef.current?.setCanvaDesign) {
              formRef.current.setCanvaDesign(parsedData);
            }
            
            // Clean up sessionStorage
            sessionStorage.removeItem(canvaTemplateParam);
          }
        }
      } catch (error) {
        console.error('[AccessibilityTextGenerator] Error processing Canva template parameter:', error);
      }
    }
  }, [searchParams, selectedType]);

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData || !formRef.current?.isValid()) return;
    
    const formData = formRef.current.getFormData();
    if (!formData) return;

    try {
      if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
        // Alt-Text generation logic
        const { hasUploadedImage, hasCanvaImage, uploadedImage, selectedCanvaDesign, imageSource, imageDescription } = formData;
        
        if (!hasUploadedImage && !hasCanvaImage) {
          console.error('[AccessibilityTextGenerator] No image selected');
          return;
        }

        console.log('[AccessibilityTextGenerator] Starting alt text generation');
        
        let imageBase64;
        let imageContext = '';
        
        if (imageSource === 'upload' && hasUploadedImage) {
          imageBase64 = await fileToBase64(uploadedImage);
          imageContext = `Bild: ${uploadedImage.name}`;
        } else if (imageSource === 'canva' && hasCanvaImage) {
          const conversionResult = await convertCanvaDesignToBase64(selectedCanvaDesign.design);
          imageBase64 = conversionResult.base64;
          imageContext = `Canva Design: ${selectedCanvaDesign.title || 'Untitled'}`;
        } else {
          throw new Error('Invalid image source or missing image data');
        }
        
        // Combine user description with image context
        let fullDescription = imageDescription || '';
        if (imageContext) {
          fullDescription = fullDescription 
            ? `${imageContext}. ${fullDescription}`
            : imageContext;
        }
        
        // Generate alt text
        const response = await generateAltTextForImage(
          imageBase64, 
          fullDescription || null
        );
        
        const altText = response?.altText || response || '';
        
        setGeneratedContent(altText);
        setGeneratedText(componentName, altText);
        
        console.log('[AccessibilityTextGenerator] Alt text generated successfully');
        setTimeout(resetSuccess, 3000);
        
      } else if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
        // Leichte Sprache generation logic
        const allAttachments = [
          ...processedAttachments,
          ...crawledUrls
        ];

        const formDataToSubmit = {
          originalText: formData.originalText,
          targetLanguage: formData.targetLanguage,
          useWebSearchTool,
          usePrivacyMode,
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
          instructionType,
          groupDetailsData,
          getKnowledgeContent,
          getDocumentContent,
          memoryOptions: {
            enableMemories: false,
            query: searchQuery
          }
        });
        
        if (finalPrompt) {
          formDataToSubmit.customPrompt = finalPrompt;
        }

        const response = await submitLeichteSprache(formDataToSubmit);
        if (response) {
          const content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};
          
          if (content) {
            setGeneratedContent(content);
            setGeneratedText(componentName, content, metadata);
            setTimeout(resetSuccess, 3000);
          }
        }
      }
    } catch (error) {
      console.error('[AccessibilityTextGenerator] Error submitting form:', error);
    }
  }, [
    selectedType, 
    generateAltTextForImage, 
    submitLeichteSprache, 
    setGeneratedText, 
    resetSuccess, 
    componentName,
    source,
    isInstructionsActive,
    getActiveInstruction,
    instructionType,
    groupDetailsData,
    getKnowledgeContent,
    getDocumentContent,
    useWebSearchTool,
    usePrivacyMode,
    processedAttachments,
    crawledUrls
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      console.log(`[AccessibilityTextGenerator] Processing ${files.length} new attached files`);
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
      
      console.log('[AccessibilityTextGenerator] Files successfully processed for submission');
    } catch (error) {
      console.error('[AccessibilityTextGenerator] File processing error:', error);
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    console.log(`[AccessibilityTextGenerator] Removing file at index ${index}`);
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  // Dynamic help content based on selected type
  const helpContent = useMemo(() => {
    if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
      return {
        content: "Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Texte sind essentiell für Screenreader und die Zugänglichkeit von Webinhalten.",
        tips: [
          "Wähle zwischen Datei-Upload oder Canva-Design",
          "Lade ein Bild hoch (JPG, PNG, WebP) oder wähle aus deinen Canva-Designs",
          "Füge optional eine Beschreibung hinzu für besseren Kontext",
          "Der generierte Alt-Text folgt DBSV-Richtlinien für Barrierefreiheit",
          "Alt-Texte sollten prägnant aber beschreibend sein",
          
        ]
      };
    } else {
      return {
        content: "Dieser Grünerator übersetzt Texte in Leichte Sprache. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.",
        tips: [
          "Füge den zu übersetzenden Text in das Textfeld ein",
          "Der Text wird automatisch nach den Regeln der Leichten Sprache übersetzt",
          "Die Regeln folgen dem Netzwerk Leichte Sprache e.V. (Neuauflage 2022)",
          "Die Übersetzung erfolgt in kurzen, klaren Sätzen",
          "Schwierige Wörter werden erklärt oder ersetzt"
        ]
      };
    }
  }, [selectedType]);

  // Feature toggles - only show for Leichte Sprache or when both support them
  const showWebSearch = selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE;
  const showPrivacyMode = true; // Both types can use privacy mode
  const showFileAttachment = selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE;

  const webSearchFeatureToggle = showWebSearch ? {
    isActive: useWebSearchTool,
    onToggle: (checked) => {
      setUseWebSearchTool(checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "",
    tabIndex: tabIndex.webSearch || 11
  } : null;

  const privacyModeToggle = showPrivacyMode ? {
    isActive: usePrivacyMode,
    onToggle: (checked) => {
      setUsePrivacyMode(checked);
    },
    label: "Privacy-Mode",
    icon: HiShieldCheck,
    description: "Verwendet deutsche Server der Netzbegrünung.",
    tabIndex: tabIndex.privacyMode || 13
  } : null;

  const renderForm = () => {
    switch (selectedType) {
      case ACCESSIBILITY_TYPES.ALT_TEXT:
        return <AltTextForm ref={formRef} tabIndex={tabIndex} />;
      case ACCESSIBILITY_TYPES.LEICHTE_SPRACHE:
        return (
          <LeichteSpracheForm 
            ref={formRef} 
            tabIndex={tabIndex}
            onUrlsDetected={handleUrlsDetected}
          />
        );
      default:
        return null;
    }
  };

  const renderTypeSelector = () => {
    const accessibilityTypeOptions = Object.entries(ACCESSIBILITY_TYPE_LABELS).map(([value, label]) => ({
      value,
      label
    }));

    return (
      <div style={{ marginBottom: 'var(--spacing-large)' }}>
        <FormSelect
          name="accessibilityType"
          label="Art der Barrierefreiheit"
          options={accessibilityTypeOptions}
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          required
        />
      </div>
    );
  };

  // Get stored generated text
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={ACCESSIBILITY_TYPE_TITLES[selectedType]}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSubmit={handleSubmit}
          formNotice={formNotice}
          helpContent={helpContent}
          componentName={componentName}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={showWebSearch}
          privacyModeToggle={privacyModeToggle}
          usePrivacyModeToggle={showPrivacyMode}
          useFeatureIcons={showWebSearch || showPrivacyMode}
          onAttachmentClick={showFileAttachment ? handleAttachmentClick : null}
          onRemoveFile={showFileAttachment ? handleRemoveFile : null}
          attachedFiles={showFileAttachment ? attachedFiles : []}
          firstExtrasChildren={renderTypeSelector()}
          submitButtonText={selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? "Alt-Text generieren" : "In Leichte Sprache übersetzen"}
          isSubmitDisabled={!formRef.current?.isValid?.()}
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

AccessibilityTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default withAuthRequired(AccessibilityTextGenerator, {
  title: 'Barrierefreiheit Generator',
  message: 'Anmeldung erforderlich für den Barrierefreiheit Generator'
});
