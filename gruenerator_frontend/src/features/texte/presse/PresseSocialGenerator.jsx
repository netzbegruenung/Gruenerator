import React, { lazy, useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
const ReactSelect = lazy(() => import('react-select'));
import BaseForm from '../../../components/common/BaseForm';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import apiClient from '../../../components/utils/apiClient';
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
  const { Input, Textarea } = useFormFields();
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

  const sharepicTypeOptions = [
    { value: 'dreizeilen', label: '3-Zeilen Slogan (mit Bild)' },
    { value: 'quote', label: 'Zitat mit Bild' },
    { value: 'quote_pure', label: 'Zitat (Nur Text)' },
    { value: 'info', label: 'Infopost' },
  ];

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

  const watchPlatforms = useWatch({ control, name: 'platforms', defaultValue: defaultPlatforms });
  const watchSharepicType = useWatch({ control, name: 'sharepicType', defaultValue: 'dreizeilen' });
  const watchUseWebSearch = useWatch({ control, name: 'useWebSearchTool', defaultValue: false });
  const watchUsePrivacyMode = useWatch({ control, name: 'usePrivacyMode', defaultValue: false });

  const watchPressemitteilung = Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = isAuthenticated && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic');

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
      await detectAndCrawlUrls(urls.join(' '), watchUsePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, watchUsePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
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

    try {
      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];
      const hasSharepic = isAuthenticated && selectedPlatforms.includes('sharepic');

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...processedAttachments,
        ...crawledUrls
      ];

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
      }

      let combinedResults = {};

      // Generate sharepic if requested
      if (hasSharepic) {
        try {
          const sharepicResult = await generateSharepic(
            rhfData.thema, 
            rhfData.details, 
            uploadedImage,
            rhfData.sharepicType || 'dreizeilen',
            rhfData.zitatAuthor,
            finalPrompt // Pass knowledge prompt to sharepic generation
          );
          // Merge newly generated sharepic with previous ones so users can keep a history
          const previousContent = useGeneratedTextStore.getState().generatedTexts?.[componentName] || socialMediaContent;
          const existingSharepics = Array.isArray(previousContent?.sharepic)
            ? previousContent.sharepic
            : previousContent?.sharepic
              ? [previousContent.sharepic]
              : [];

          const newSharepicEntry = {
            ...sharepicResult,
            id: `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: new Date().toISOString()
          };

          combinedResults.sharepic = [newSharepicEntry, ...existingSharepics];
        } catch (sharepicError) {
          console.error('[PresseSocialGenerator] Sharepic generation failed:', sharepicError);
          // Continue with social generation even if sharepic fails
        }
      }

      // Generate regular social content for other platforms
      const otherPlatforms = selectedPlatforms.filter(p => p !== 'sharepic');
      if (otherPlatforms.length > 0) {
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
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent, generateSharepic, uploadedImage, processedAttachments, crawledUrls, socialMediaContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  

  const handleEditSharepic = useCallback(async (sharepicData) => {
    // Clean up old edit sessions to prevent sessionStorage accumulation
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sharepic-edit-')) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data.timestamp && data.timestamp < fiveMinutesAgo) {
            sessionStorage.removeItem(key);
            console.log('[PresseSocialGenerator] Cleaned up old edit session:', key);
            i--; // Adjust index since we removed an item
          }
        } catch (e) {
          // Remove invalid data
          sessionStorage.removeItem(key);
          i--; // Adjust index since we removed an item
        }
      }
    }
    
    // Create unique editing session ID
    const editingSessionId = `sharepic-edit-${Date.now()}`;
    
    try {
      let imageSessionId = null;
      
      // Upload image to backend Redis storage if available
      if (sharepicData.image) {
        try {
          const imageResponse = await apiClient.post('/sharepic/edit-session', {
            imageData: sharepicData.image,
            metadata: {
              type: sharepicData.type,
              timestamp: Date.now()
            }
          });
          
          // Handle Axios response wrapper - extract data
          const result = imageResponse.data || imageResponse;
          imageSessionId = result.sessionId;
          console.log('[PresseSocialGenerator] Image stored in backend:', imageSessionId);
        } catch (imageUploadError) {
          console.warn('[PresseSocialGenerator] Failed to store image in backend:', imageUploadError);
        }
      }
      
      // Store minimal data in sessionStorage for cross-tab access
      const sessionData = {
        text: sharepicData.text,
        type: sharepicData.type,
        // Remove alternatives arrays - they're not needed for editing and can be large
        hasImage: !!sharepicData.image,
        imageSessionId: imageSessionId, // Store session ID instead of image
        hasOriginalImage: !!sharepicData.originalImage
      };
      
      // Add size check before storing in sessionStorage
      const dataToStore = JSON.stringify({
        source: 'presseSocial',
        data: sessionData,
        timestamp: Date.now()
      });
      
      // Check size (sessionStorage typically has 5-10MB limit)
      if (dataToStore.length > 1000000) { // 1MB safety limit
        console.error('[PresseSocialGenerator] Session data too large:', dataToStore.length, 'bytes');
        throw new Error('Session data too large for storage');
      }
      
      sessionStorage.setItem(editingSessionId, dataToStore);
    } catch (error) {
      console.error('[PresseSocialGenerator] Error preparing edit session:', error);
      // Fallback: store without image
      sessionStorage.setItem(editingSessionId, JSON.stringify({
        source: 'presseSocial',
        data: {
          text: sharepicData.text,
          type: sharepicData.type,
          // Remove alternatives arrays - they're not needed for editing and can be large
          hasImage: false
        },
        timestamp: Date.now()
      }));
    }
    
    // Open Sharepicgenerator in new tab with editing session
    const url = new URL(window.location.origin + '/sharepic');
    url.searchParams.append('editSession', editingSessionId);
    window.open(url.toString(), '_blank');
  }, []);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error('[PresseSocialGenerator] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
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
            <Controller
              name="sharepicType"
              control={control}
              rules={{}}
              defaultValue="dreizeilen"
              render={({ field, fieldState: { error } }) => (
                <FormFieldWrapper
                  label="Sharepic Art"
                  required={false}
                  error={error?.message}
                  htmlFor="sharepicType-select"
                >
                  <div className="sharepic-type-selector">
                    <ReactSelect
                      {...field}
                      inputId="sharepicType-select"
                      className={`react-select ${error ? 'error' : ''}`.trim()}
                      classNamePrefix="react-select"
                      options={sharepicTypeOptions}
                      value={sharepicTypeOptions.find(option => option.value === field.value)}
                      onChange={(selectedOption) => {
                        field.onChange(selectedOption ? selectedOption.value : '');
                      }}
                      onBlur={field.onBlur}
                      placeholder="Sharepic Art auswählen..."
                      isClearable={false}
                      isSearchable={false}
                      openMenuOnFocus={false}
                      blurInputOnSelect={true}
                      autoFocus={false}
                      tabSelectsValue={true}
                      backspaceRemovesValue={true}
                      captureMenuScroll={false}
                      menuShouldBlockScroll={false}
                      menuShouldScrollIntoView={false}
                      tabIndex={tabIndex.sharepicType}
                      noOptionsMessage={() => 'Keine Optionen verfügbar'}
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                    />
                  </div>
                </FormFieldWrapper>
              )}
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
          enableEditMode={true}
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
          featureIconsTabIndex={{
            webSearch: tabIndex.webSearch,
            privacyMode: tabIndex.privacyMode,
            attachment: tabIndex.attachment
          }}
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
