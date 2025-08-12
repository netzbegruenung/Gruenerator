import React, { useState, useCallback, useContext, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
// import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiInformationCircle, HiShieldCheck } from 'react-icons/hi';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import { TabIndexHelpers } from '../../../utils/tabIndexConfig';
import useSharepicGeneration from '../../../hooks/useSharepicGeneration';
import FileUpload from '../../../components/common/FileUpload';
import Icon from '../../../components/common/Icon';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { HiGlobeAlt } from 'react-icons/hi';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'presse-social';
  const { initialContent } = useSharedContent();
  const { isAuthenticated } = useOptimizedAuth();
  const { Input, Textarea, Select } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Initialize knowledge system with UI configuration
  useKnowledge({ 
    instructionType: 'social', 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('PRESS_SOCIAL');
  const baseFormTabIndex = useBaseFormTabIndex('PRESS_SOCIAL');

  const platformOptions = useMemo(() => {
    const options = [
      { id: 'pressemitteilung', label: 'Pressemitteilung', icon: <Icon category="platforms" name="pressemitteilung" size={16} /> },
      { id: 'instagram', label: 'Instagram', icon: <Icon category="platforms" name="instagram" size={16} /> },
      { id: 'facebook', label: 'Facebook', icon: <Icon category="platforms" name="facebook" size={16} /> },
      { id: 'twitter', label: 'Twitter/X, Mastodon & Bluesky', icon: <Icon category="platforms" name="twitter" size={16} /> },
      { id: 'linkedin', label: 'LinkedIn', icon: <Icon category="platforms" name="linkedin" size={16} /> },
      { id: 'sharepic', label: 'Sharepic', icon: <Icon category="platforms" name="sharepic" size={16} /> },
      { id: 'actionIdeas', label: 'Aktionsideen', icon: <Icon category="platforms" name="actionIdeas" size={16} /> },
      { id: 'reelScript', label: 'Skript für Reels & Tiktoks', icon: <Icon category="platforms" name="reelScript" size={16} /> }
    ];
    return isAuthenticated ? options : options.filter(opt => opt.id !== 'sharepic');
  }, [isAuthenticated]);

  const defaultPlatforms = useMemo(() => {
    // Determine default platforms based on initial content
    let selectedPlatforms = [];
    if (initialContent?.platforms) {
      selectedPlatforms = Object.keys(initialContent.platforms).filter(
        key => initialContent.platforms[key]
      );
      if (selectedPlatforms.length > 0) {
        return isAuthenticated ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
      }
    }

    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }

    return isAuthenticated ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic'); // No default selection or filtered
  }, [initialContent, isAuthenticated]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      zitatgeber: initialContent?.zitatgeber || '',
      platforms: defaultPlatforms,
      sharepicType: 'dreizeilen',
      zitatAuthor: '',
      useWebSearchTool: false,
      usePrivacyMode: false
    }
  });

  const watchPlatforms = watch('platforms');
  const watchPressemitteilung = watchPlatforms && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = isAuthenticated && watchPlatforms && watchPlatforms.includes('sharepic');
  const watchSharepicType = watch('sharepicType');
  const watchUseWebSearch = watch('useWebSearchTool');
  const watchUsePrivacyMode = watch('usePrivacyMode');

  // Ensure sharepic is not selected when user is not authenticated
  useEffect(() => {
    if (!isAuthenticated && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic')) {
      const filtered = watchPlatforms.filter(p => p !== 'sharepic');
      setValue('platforms', filtered);
    }
  }, [isAuthenticated, watchPlatforms, setValue]);

  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
  }, []);

  const [socialMediaContent, setSocialMediaContent] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
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
      console.log(`[PresseSocialGenerator] Detected ${urls.length} URLs, starting crawl with privacy mode: ${watchUsePrivacyMode}`);
      await detectAndCrawlUrls(urls.join(' '), watchUsePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, watchUsePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
    console.log(`[PresseSocialGenerator] Retrying URL: ${url}`);
    await retryUrl(url, watchUsePrivacyMode);
  }, [retryUrl, watchUsePrivacyMode]);
  // const textSize = useDynamicTextSize(socialMediaContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');
  const { generateSharepic, loading: sharepicLoading } = useSharepicGeneration();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    selectedKnowledgeIds,
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
    instructionType: 'social',
    groupDetailsData,
    availableKnowledge,
  });

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    console.log('[PresseSocialGenerator] Formular abgeschickt. Store-Status:', {
        source,
        availableKnowledgeCount: availableKnowledge.length,
        selectedKnowledgeIds: Array.from(selectedKnowledgeIds),
        hasSelectedKnowledge: selectedKnowledgeIds.size > 0,
        instructions,
        isInstructionsActive,
        groupInstructions: groupDetailsData?.instructions?.custom_social_prompt ? `Vorhanden, Länge: ${groupDetailsData.instructions.custom_social_prompt.length}` : null,
    });

    try {
      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];
      const hasSharepic = isAuthenticated && selectedPlatforms.includes('sharepic');

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...processedAttachments,
        ...crawledUrls
      ];

      console.log(`[PresseSocialGenerator] Submitting form with ${processedAttachments.length} file attachments and ${crawledUrls.length} crawled URLs`);

      const formDataToSubmit = {
        thema: rhfData.thema,
        details: rhfData.details,
        platforms: selectedPlatforms,
        zitatgeber: rhfData.zitatgeber,
        useWebSearchTool: rhfData.useWebSearchTool,
        usePrivacyMode: rhfData.usePrivacyMode,
        attachments: allAttachments
      };
      
      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.thema) queryParts.push(data.thema);
        if (data.details) queryParts.push(data.details);
        if (data.zitatgeber) queryParts.push(data.zitatgeber);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };
      
      const searchQuery = extractQueryFromFormData(formDataToSubmit);
      console.log('[PresseSocialGenerator] Extracted search query from form:', searchQuery);

      // Add knowledge, instructions, and documents
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'social',
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
        console.log('[PresseSocialGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[PresseSocialGenerator] No custom instructions or knowledge for generation.');
      }

      let combinedResults = {};

      // Generate sharepic if requested
      if (hasSharepic) {
        console.log('[PresseSocialGenerator] Generating sharepic...');
        try {
          const sharepicResult = await generateSharepic(
            rhfData.thema, 
            rhfData.details, 
            uploadedImage,
            rhfData.sharepicType || 'dreizeilen',
            rhfData.zitatAuthor,
            finalPrompt // Pass knowledge prompt to sharepic generation
          );
          combinedResults.sharepic = sharepicResult;
          console.log('[PresseSocialGenerator] Sharepic generated successfully');
        } catch (sharepicError) {
          console.error('[PresseSocialGenerator] Sharepic generation failed:', sharepicError);
          // Continue with social generation even if sharepic fails
        }
      }

      // Generate regular social content for other platforms
      const otherPlatforms = selectedPlatforms.filter(p => p !== 'sharepic');
      if (otherPlatforms.length > 0) {
        console.log('[PresseSocialGenerator] Generating social content for platforms:', otherPlatforms);
        const response = await submitForm({
          ...formDataToSubmit,
          platforms: otherPlatforms
        });
        
        if (response) {
          // Handle both old string format and new {content, metadata} format
          const content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};
          combinedResults.social = { content, metadata };
        }
      }

      // Set combined content
      if (combinedResults.sharepic || combinedResults.social) {
        const finalContent = {
          ...combinedResults,
          // For backward compatibility, also set the main content
          content: combinedResults.social?.content || '',
          metadata: combinedResults.social?.metadata || {},
          // Add edit handler for sharepics
          onEditSharepic: handleEditSharepic
        };
        
        setSocialMediaContent(finalContent);
        setGeneratedText(componentName, finalContent, finalContent.metadata);
        setTimeout(resetSuccess, 3000);
      }
    } catch (submitError) {
      console.error('[PresseSocialGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent, generateSharepic, uploadedImage, processedAttachments, crawledUrls]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleEditSharepic = useCallback((sharepicData) => {
    // Create unique editing session ID
    const editingSessionId = `sharepic-edit-${Date.now()}`;
    
    // Store data in sessionStorage for cross-tab access
    sessionStorage.setItem(editingSessionId, JSON.stringify({
      source: 'presseSocial',
      data: sharepicData,
      timestamp: Date.now()
    }));
    
    // Open Sharepicgenerator in new tab with editing session
    const url = new URL(window.location.origin + '/sharepic');
    url.searchParams.append('editSession', editingSessionId);
    window.open(url.toString(), '_blank');
  }, []);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      console.log(`[PresseSocialGenerator] Processing ${files.length} new attached files`);
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
      
      console.log('[PresseSocialGenerator] Files successfully processed for submission');
    } catch (error) {
      console.error('[PresseSocialGenerator] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    console.log(`[PresseSocialGenerator] Removing file at index ${index}`);
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);


  const helpContent = {
    content: "Dieser Grünerator erstellt professionelle Pressemitteilungen und Social Media Inhalte basierend auf deinen Angaben. Du kannst auch PDFs, Bilder und URLs als Hintergrundinformation verwenden.",
    tips: [
      "Gib ein klares, prägnantes Thema an",
      "Füge wichtige Details und Fakten hinzu",
      "Wähle die gewünschten Formate aus",
      "Hänge PDFs oder Bilder als Kontext an (max. 5MB pro Datei)",
      "URLs werden automatisch erkannt und der Inhalt als Kontext hinzugefügt",
      "Bei Pressemitteilungen: Angabe von Zitatgeber erforderlich - Abbinder wird automatisch hinzugefügt",
      "Bei Sharepics: Wähle zwischen 5 Formaten - 3-Zeilen Slogan (mit Bild), Zitat mit Bild, Zitat (Nur Text), Infopost oder Nur Text (Groß). Bei Zitat-Formaten ist die Angabe des Autors erforderlich"
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
        className="form-textarea-large"
        tabIndex={tabIndex.details}
        enableUrlDetection={true}
        onUrlsDetected={handleUrlsDetected}
      />

      <AnimatePresence>
        {watchSharepic && (
          <motion.div 
            className="sharepic-upload-fields"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 25,
              duration: 0.25 
            }}
          >
            <h4>Sharepic:</h4>
            <Select
              name="sharepicType"
              control={control}
              label="Sharepic Art"
              options={[
                { value: 'dreizeilen', label: '3-Zeilen Slogan (mit Bild)' },
                { value: 'quote', label: 'Zitat mit Bild' },
                { value: 'quote_pure', label: 'Zitat (Nur Text)' },
                { value: 'info', label: 'Infopost' },
                { value: 'headline', label: 'Nur Text (Groß)' }
              ]}
              defaultValue="dreizeilen"
              tabIndex={tabIndex.sharepicType}
            />

            <AnimatePresence>
              {(watchSharepicType === 'quote' || watchSharepicType === 'quote_pure') && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 25,
                    duration: 0.25 
                  }}
                >
                  <Input
                    name="zitatAuthor"
                    control={control}
                    label="Autor/Urheber des Zitats"
                    placeholder="z.B. Anton Hofreiter"
                    rules={{ required: 'Autor ist für Zitat-Sharepics erforderlich' }}
                    tabIndex={TabIndexHelpers.getConditional(tabIndex.zitatAuthor, watchSharepicType === 'quote' || watchSharepicType === 'quote_pure')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {(watchSharepicType === 'dreizeilen' || watchSharepicType === 'quote') && (
              <FileUpload
                handleChange={handleImageChange}
                allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                file={uploadedImage}
                loading={loading || sharepicLoading}
                label="Bild für Sharepic (optional)"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {watchPressemitteilung && (
          <motion.div 
            className={`press-release-fields ${watchSharepic ? 'has-preceding-section' : ''}`.trim()}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 25,
              duration: 0.25 
            }}
          >
            <h4>Pressemitteilung:</h4>
            <Input
              name="zitatgeber"
              control={control}
              label={FORM_LABELS.WHO_QUOTE}
              subtext="Mehrere Personen können genannt werden."
              placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
              rules={{ required: 'Zitatgeber ist ein Pflichtfeld für Pressemitteilungen' }}
              tabIndex={TabIndexHelpers.getConditional(tabIndex.zitatgeber, watchPressemitteilung)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
  

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Presse- & Social Media Grünerator"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading || sharepicLoading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          enablePlatformSelector={true}
          platformOptions={platformOptions}
          platformSelectorLabel="Formate"
          platformSelectorPlaceholder="Formate auswählen..."
          platformSelectorHelpText="Wähle ein oder mehrere Formate für die dein Content optimiert werden soll"
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

PresseSocialGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default PresseSocialGenerator; 