import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Controller, useWatch } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import ReactSelect from 'react-select';
import BaseForm from '../../../components/common/BaseForm';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import apiClient from '../../../components/utils/apiClient';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import { HiInformationCircle } from 'react-icons/hi';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import { TabIndexHelpers } from '../../../utils/tabIndexConfig';
import useSharepicGeneration from '../../../hooks/useSharepicGeneration';
import FileUpload from '../../../components/common/FileUpload';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import SmartInput from '../../../components/common/Form/SmartInput';
import { getIcon } from '../../../config/icons';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'presse-social';
  const { initialContent } = useSharedContent();
  const { isAuthenticated, user } = useOptimizedAuth();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';
  const canUseSharepic = isAuthenticated && !isAustrian;

  const platformOptions = useMemo(() => {
    const options = [
      { id: 'pressemitteilung', label: 'Pressemitteilung', icon: <Icon category="platforms" name="pressemitteilung" size={16} /> },
      { id: 'instagram', label: 'Instagram', icon: <Icon category="platforms" name="instagram" size={16} /> },
      { id: 'facebook', label: 'Facebook', icon: <Icon category="platforms" name="facebook" size={16} /> },
      { id: 'twitter', label: 'Twitter/X, Mastodon & Bsky', icon: <Icon category="platforms" name="twitter" size={16} /> },
      { id: 'linkedin', label: 'LinkedIn', icon: <Icon category="platforms" name="linkedin" size={16} /> },
      { id: 'sharepic', label: 'Sharepic', icon: <Icon category="platforms" name="sharepic" size={16} /> },
      { id: 'actionIdeas', label: 'Aktionsideen', icon: <Icon category="platforms" name="actionIdeas" size={16} /> },
      { id: 'reelScript', label: 'Skript für Reels & Tiktoks', icon: <Icon category="platforms" name="reelScript" size={16} /> }
    ];
    return canUseSharepic ? options : options.filter(opt => opt.id !== 'sharepic');
  }, [canUseSharepic]);

  const sharepicTypeOptions = [
    { value: 'default', label: 'Standard (3 Sharepics automatisch)' },
    { value: 'dreizeilen', label: '3-Zeilen Slogan (mit Bild)' },
    { value: 'quote', label: 'Zitat mit Bild' },
    { value: 'quote_pure', label: 'Zitat ohne Bild' },
    { value: 'info', label: 'Infopost' },
  ];

  // Optimization: Memoize defaultPlatforms to prevent recalculation on every render
  const defaultPlatforms = useMemo(() => {
    // Determine default platforms based on initial content
    let selectedPlatforms = [];
    if (initialContent?.platforms) {
      selectedPlatforms = Object.keys(initialContent.platforms).filter(
        key => initialContent.platforms[key]
      );
      if (selectedPlatforms.length > 0) {
        return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
      }
    }

    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }

    return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
  }, [initialContent, canUseSharepic]);

  // Use useBaseForm to get automatic document/text fetching
  const form = useBaseForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      zitatgeber: initialContent?.zitatgeber || '',
      presseabbinder: '',
      platforms: defaultPlatforms,
      sharepicType: 'default',
      zitatAuthor: ''
    },
    shouldUnregister: false,  // Preserve field values when conditionally rendered
    generatorType: 'presse-social',
    componentName: 'presse-social',
    endpoint: '/claude_social',
    instructionType: 'social',
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'PRESS_SOCIAL',
    defaultMode: 'privacy',
    disableKnowledgeSystem: false  // Enable knowledge system for document/text fetching
  });

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    errors
  } = form;

  const watchPlatforms = useWatch({ control, name: 'platforms', defaultValue: defaultPlatforms });
  const watchSharepicType = useWatch({ control, name: 'sharepicType', defaultValue: 'default' });

  const watchPressemitteilung = Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic');

  // Ensure sharepic is not selected when user cannot use it
  useEffect(() => {
    if (!canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic')) {
      const filtered = watchPlatforms.filter(p => p !== 'sharepic');
      setValue('platforms', filtered);
    }
  }, [canUseSharepic, watchPlatforms, setValue]);


  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
  }, []);

  const [socialMediaContent, setSocialMediaContent] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);

  // Get selection store state (fetching is now handled by useBaseForm)
  // Use proper selectors for reactive subscriptions
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  // Fetch user's custom instructions
  const customPrompt = useUserInstructions('social', isInstructionsActive);

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
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
    await retryUrl(url, usePrivacyMode);
  }, [retryUrl, usePrivacyMode]);

  // Get generator utilities from useBaseForm
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');
  const { generateSharepic, loading: sharepicLoading } = useSharepicGeneration();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];
      const hasSharepic = canUseSharepic && selectedPlatforms.includes('sharepic');

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
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
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

      // Add custom prompt from user instructions (simplified)
      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
      formDataToSubmit.selectedTextIds = selectedTextIds || [];
      formDataToSubmit.searchQuery = searchQuery || '';

      let combinedResults = {};
      const otherPlatforms = selectedPlatforms.filter(p => p !== 'sharepic');

      // Run sharepic and social generation in PARALLEL for better performance
      const generationPromises = [];

      // Prepare sharepic generation promise
      if (hasSharepic) {
        generationPromises.push(
          generateSharepic(
            rhfData.thema,
            rhfData.details,
            uploadedImage,
            rhfData.sharepicType || 'default',
            rhfData.zitatAuthor,
            customPrompt,
            allAttachments,
            features.usePrivacyMode,
            null,
            features.useBedrock
          ).then(result => ({ type: 'sharepic', result }))
           .catch(error => ({ type: 'sharepic', error }))
        );
      }

      // Prepare social generation promise
      if (otherPlatforms.length > 0) {
        generationPromises.push(
          submitForm({
            ...formDataToSubmit,
            platforms: otherPlatforms
          }).then(result => ({ type: 'social', result }))
            .catch(error => ({ type: 'social', error }))
        );
      }

      // Execute all generations in parallel
      const results = await Promise.all(generationPromises);

      // Process results
      for (const outcome of results) {
        if (outcome.type === 'sharepic' && !outcome.error && outcome.result) {
          const sharepicResult = outcome.result;
          const previousContent = useGeneratedTextStore.getState().generatedTexts?.[componentName] || socialMediaContent;
          const existingSharepics = Array.isArray(previousContent?.sharepic)
            ? previousContent.sharepic
            : previousContent?.sharepic
              ? [previousContent.sharepic]
              : [];

          let newSharepicEntries;
          if (Array.isArray(sharepicResult)) {
            newSharepicEntries = sharepicResult.map(sharepic => ({
              ...sharepic,
              id: sharepic.id || `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: sharepic.createdAt || new Date().toISOString()
            }));
          } else {
            newSharepicEntries = [{
              ...sharepicResult,
              id: `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: new Date().toISOString()
            }];
          }

          combinedResults.sharepic = [...newSharepicEntries, ...existingSharepics];
        } else if (outcome.type === 'sharepic' && outcome.error) {
          console.error('[PresseSocialGenerator] Sharepic generation failed:', outcome.error);
        }

        if (outcome.type === 'social' && !outcome.error && outcome.result) {
          const response = outcome.result;
          let content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};

          if (otherPlatforms.includes('pressemitteilung') && rhfData.presseabbinder?.trim()) {
            content = `${content}\n\n---\n\n${rhfData.presseabbinder.trim()}`;
          }

          combinedResults.social = { content, metadata };
        } else if (outcome.type === 'social' && outcome.error) {
          console.error('[PresseSocialGenerator] Social generation failed:', outcome.error);
        }
      }

      // Set combined content
      if (combinedResults.sharepic || combinedResults.social) {
        const finalContent = {
          ...combinedResults,
          // For backward compatibility, also set the main content
          content: combinedResults.social?.content || '',
          metadata: combinedResults.social?.metadata || {},
          // Add selected platforms for social sharing feature
          selectedPlatforms: otherPlatforms,
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
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, generateSharepic, uploadedImage, processedAttachments, crawledUrls, socialMediaContent, selectedDocumentIds, selectedTextIds, getFeatureState, canUseSharepic]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      const processed = await prepareFilesForSubmission(files);

      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error('[PresseSocialGenerator] File processing error:', error);
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

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
            originalImageData: sharepicData.originalImage, // Store original background
            metadata: {
              type: sharepicData.type,
              hasOriginalImage: !!sharepicData.originalImage,
              timestamp: Date.now()
            }
          });

          // Handle Axios response wrapper - extract data
          const result = imageResponse.data || imageResponse;
          imageSessionId = result.sessionId;
          console.log('[PresseSocialGenerator] Images stored in backend:', imageSessionId, 'hasOriginal:', !!sharepicData.originalImage);
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

  const helpContent = {
    content: "Dieser Grünerator erstellt professionelle Pressemitteilungen und Social Media Inhalte basierend auf deinen Angaben.",
    tips: [
      "Gib ein klares, prägnantes Thema an",
      "Füge wichtige Details und Fakten hinzu",
      "Wähle die gewünschten Formate aus",
      "Bei Pressemitteilungen: Angabe von Zitatgeber erforderlich",
      "Bei Sharepics: Standard erstellt automatisch 3 verschiedene Sharepics. Weitere Formate: 3-Zeilen Slogan, Zitat mit/ohne Bild, Infopost"
    ]
  };

  const renderPlatformSection = () => (
    <PlatformSelector
      name="platforms"
      control={control}
      platformOptions={platformOptions}
      label="Formate"
      placeholder="Formate auswählen..."
      required={true}
      tabIndex={form.generator?.baseFormTabIndex?.platformSelectorTabIndex}
    />
  );

  const renderFormInputs = () => (
    <>
      <FormInput
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={form.generator?.tabIndex?.thema}
      />

      <FormTextarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        className="form-textarea-large"
        tabIndex={form.generator?.tabIndex?.details}
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
              defaultValue="default"
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
                      tabIndex={form.generator?.tabIndex?.sharepicType}
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
                  <SmartInput
                    fieldType="zitatAuthor"
                    formName="presseSocial"
                    name="zitatAuthor"
                    control={control}
                    setValue={setValue}
                    getValues={getValues}
                    label="Autor/Urheber des Zitats"
                    placeholder="z.B. Anton Hofreiter"
                    rules={{ required: 'Autor ist für Zitat-Sharepics erforderlich' }}
                    tabIndex={TabIndexHelpers.getConditional(form.generator?.tabIndex?.zitatAuthor, watchSharepicType === 'quote' || watchSharepicType === 'quote_pure')}
                    onSubmitSuccess={success ? getValues('zitatAuthor') : null}
                    shouldSave={success}
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
            <SmartInput
              fieldType="zitatgeber"
              formName="presseSocial"
              name="zitatgeber"
              control={control}
              setValue={setValue}
              getValues={getValues}
              label={FORM_LABELS.WHO_QUOTE}
              subtext="Mehrere Personen können genannt werden."
              placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
              rules={{ required: 'Zitatgeber ist ein Pflichtfeld für Pressemitteilungen' }}
              tabIndex={TabIndexHelpers.getConditional(form.generator?.tabIndex?.zitatgeber, watchPressemitteilung)}
              onSubmitSuccess={success ? getValues('zitatgeber') : null}
              shouldSave={success}
            />
            <SmartInput
              fieldType="presseabbinder"
              formName="presseSocial"
              name="presseabbinder"
              control={control}
              setValue={setValue}
              getValues={getValues}
              label="Presseabbinder (optional)"
              subtext="Standard-Abbinder, der an die Pressemitteilung angehängt wird (z.B. Kontaktdaten, Vereinsinformationen)."
              placeholder="z.B. Kontakt: Max Mustermann, presse@gruene-example.de"
              tabIndex={TabIndexHelpers.getConditional(form.generator?.tabIndex?.presseabbinder, watchPressemitteilung)}
              onSubmitSuccess={success ? getValues('presseabbinder') : null}
              shouldSave={success}
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
          title={<span className="gradient-title">Presse- & Social Media Grünerator</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading || sharepicLoading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          enableEditMode={true}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          helpContent={helpContent}
          componentName={componentName}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          featureIconsTabIndex={{
            webSearch: form.generator?.tabIndex?.webSearch,
            privacyMode: form.generator?.tabIndex?.privacyMode,
            attachment: form.generator?.tabIndex?.attachment
          }}
          knowledgeSelectorTabIndex={form.generator?.baseFormTabIndex?.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={form.generator?.baseFormTabIndex?.knowledgeSourceSelectorTabIndex}
          documentSelectorTabIndex={form.generator?.baseFormTabIndex?.documentSelectorTabIndex}
          submitButtonTabIndex={form.generator?.baseFormTabIndex?.submitButtonTabIndex}
          firstExtrasChildren={renderPlatformSection()}
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
