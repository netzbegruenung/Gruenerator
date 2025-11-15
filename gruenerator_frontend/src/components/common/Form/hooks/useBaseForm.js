import { useForm, useWatch } from 'react-hook-form';
import { useCallback, useState, useMemo, useEffect } from 'react';
import useApiSubmit from '../../../hooks/useApiSubmit';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import { useDocumentsStore } from '../../../../stores/documentsStore';
import { useTabIndex, useBaseFormTabIndex } from '../../../../hooks/useTabIndex';
import { prepareFilesForSubmission } from '../../../../utils/fileAttachmentUtils';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useAuthStore } from '../../../../stores/authStore';

/**
 * Simplified BaseForm Hook für react-hook-form Integration
 * Dünner Wrapper um useForm mit einigen Utility-Funktionen
 * @param {Object} config - Hook-Konfiguration
 * @returns {Object} Form-Funktionen und Zustand
 */
const useFeatureToggles = (control, defaultValues) => {
  const webSearch = useWatch({
    control,
    name: 'useWebSearchTool',
    defaultValue: defaultValues.useWebSearchTool ?? false
  });

  const privacyMode = useWatch({
    control,
    name: 'usePrivacyMode',
    defaultValue: defaultValues.usePrivacyMode ?? false
  });

  const proMode = useWatch({
    control,
    name: 'useProMode',
    defaultValue: defaultValues.useProMode ?? false
  });

  return useMemo(() => ({
    webSearch,
    privacyMode,
    proMode
  }), [webSearch, privacyMode, proMode]);
};

const useBaseForm = ({
  defaultValues = {},
  mode = 'onChange',
  reValidateMode = 'onChange',
  criteriaMode = 'firstError',
  shouldFocusError = true,
  shouldUnregister = false,
  shouldUseNativeValidation = false,
  delayError = undefined,

  // Generator-specific configuration
  generatorType = null,
  componentName = null,
  endpoint = null,
  instructionType = null,
  features = [],
  tabIndexKey = null,
  helpContent = null,
  platformOptions = null,
  enablePlatformSelector = false,
  disableKnowledgeSystem = false,
  useFeatureIcons = true,

  ...restOptions
} = {}) => {
  
  // React-Hook-Form Initialization
  const hookFormMethods = useForm({
    defaultValues,
    mode,
    reValidateMode,
    criteriaMode,
    shouldFocusError,
    shouldUnregister,
    shouldUseNativeValidation,
    delayError,
    ...restOptions
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    getValue,
    getValues,
    trigger,
    formState: {
      errors,
      isDirty,
      isValid,
      isSubmitted,
      isSubmitting,
      isLoading,
      isSubmitSuccessful,
      submitCount,
      touchedFields,
      dirtyFields
    }
  } = hookFormMethods;

  const toggles = useFeatureToggles(control, defaultValues);

  // ALWAYS call hooks unconditionally (Rules of Hooks)
  // Authentication hooks
  const { user, isAuthenticated } = useOptimizedAuth();
  const { memoryEnabled } = useAuthStore();

  // Tab index hooks - pass undefined (not null) when not needed to avoid warnings
  const tabIndex = useTabIndex(tabIndexKey || undefined);
  const baseFormTabIndex = useBaseFormTabIndex(tabIndexKey || undefined);

  // Store hooks
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const { setUIConfig, setAvailableDocuments, setAvailableTexts } = useGeneratorSelectionStore();
  const { fetchCombinedContent, documents: documentsFromStore, texts: textsFromStore } = useDocumentsStore();

  // State hooks
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);

  // API hook - pass null when not needed
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit(generatorType ? endpoint : null);

  // Enhanced reset function that preserves original API
  const enhancedReset = useCallback((values = defaultValues) => {
    reset(values);
  }, [reset, defaultValues]);

  // Enhanced set field value with better defaults
  const setFieldValue = useCallback((name, value, options = {}) => {
    setValue(name, value, {
      shouldValidate: true,
      shouldDirty: true,
      ...options
    });
  }, [setValue]);

  // Enhanced set field error
  const setFieldError = useCallback((name, error) => {
    setError(name, {
      type: 'manual',
      message: error
    });
  }, [setError]);

  // Enhanced clear field errors
  const clearFieldErrors = useCallback((names) => {
    if (Array.isArray(names)) {
      names.forEach(name => clearErrors(name));
    } else if (names) {
      clearErrors(names);
    } else {
      clearErrors();
    }
  }, [clearErrors]);

  // Validation function
  const validateForm = useCallback(async (data = getValues()) => {
    return await trigger();
  }, [trigger, getValues]);

  // Error handling state and functions
  const [globalError, setGlobalError] = useState('');

  /**
   * Generates user-friendly error message based on error code
   * @param {string} error - Error text or code
   * @returns {string} User-friendly error message
   */
  const getErrorMessage = useCallback((error) => {
    if (!error) return '';
    
    const errorMessages = {
      '400': 'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403': 'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404': 'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429': 'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
      '500': 'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
      '529': 'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.'
    };

    for (const [code, message] of Object.entries(errorMessages)) {
      if (error.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }

    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  }, []);

  /**
   * Handles errors during form submission
   * @param {Error} error - Error object
   */
  const handleSubmitError = useCallback((error) => {
    console.error('[useBaseForm] Submit error:', error);
    if (error?.response?.status) {
      setGlobalError(`${error.response.status}`);
    } else if (error?.message) {
      setGlobalError(error.message);
    } else {
      setGlobalError('Ein unbekannter Fehler ist aufgetreten.');
    }
  }, []);

  /**
   * Clears the global error state
   */
  const clearGlobalError = useCallback(() => {
    setGlobalError('');
  }, []);

  // Initialize knowledge system (UI config + data fetching)
  // Hook must be called unconditionally, condition goes inside
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem) {
      // Set UI configuration to enable knowledge features
      setUIConfig({
        enableKnowledge: true,
        enableDocuments: true,
        enableTexts: true,
        enableSourceSelection: true
      });

      // Fetch documents and texts from backend
      fetchCombinedContent().catch((error) => {
        console.error('[useBaseForm] Failed to fetch combined content:', error);
      });
    }
  }, [generatorType, disableKnowledgeSystem, setUIConfig, fetchCombinedContent]);

  // Sync documents from documentsStore to generatorSelectionStore
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && documentsFromStore) {
      setAvailableDocuments(documentsFromStore);
    }
  }, [generatorType, disableKnowledgeSystem, documentsFromStore, setAvailableDocuments]);

  // Sync texts from documentsStore to generatorSelectionStore
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && textsFromStore) {
      setAvailableTexts(textsFromStore);
    }
  }, [generatorType, disableKnowledgeSystem, textsFromStore, setAvailableTexts]);

  // Selection store integration - always get store, conditionally use values
  const selectionStore = useGeneratorSelectionStore();

  // Conditionally extract values based on knowledge system status
  const source = (!generatorType || disableKnowledgeSystem) ? { type: 'neutral' } : selectionStore.source;
  const isInstructionsActive = (!generatorType || disableKnowledgeSystem) ? false : selectionStore.isInstructionsActive;
  const instructions = (!generatorType || disableKnowledgeSystem) ? {} : selectionStore.instructions;
  const getActiveInstruction = (!generatorType || disableKnowledgeSystem) ? () => null : selectionStore.getActiveInstruction;
  const groupDetailsData = (!generatorType || disableKnowledgeSystem) ? null : selectionStore.groupData;
  const selectedDocumentIds = (!generatorType || disableKnowledgeSystem) ? [] : selectionStore.selectedDocumentIds;
  const selectedTextIds = (!generatorType || disableKnowledgeSystem) ? [] : selectionStore.selectedTextIds;
  const useAutomaticSearch = (!generatorType || disableKnowledgeSystem) ? false : selectionStore.useAutomaticSearch;

  // File attachment handlers - always define, conditionally use
  const handleAttachmentClick = useCallback(async (files) => {
    if (!generatorType) return;
    try {
      const processed = await prepareFilesForSubmission(files);
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error(`[${generatorType}] File processing error:`, error);
    }
  }, [generatorType]);

  const handleRemoveFile = useCallback((index) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  // Feature toggles configuration
  const webSearchFeatureToggle = useMemo(() => ({
      isActive: Boolean(toggles.webSearch),
      onToggle: (checked) => {
        setFieldValue('useWebSearchTool', checked);
      },
      label: "Websuche verwenden",
      icon: HiGlobeAlt,
      description: "",
      tabIndex: tabIndex?.webSearch || 11
  }), [toggles.webSearch, setFieldValue, tabIndex?.webSearch]);

  const privacyModeToggle = useMemo(() => ({
      isActive: Boolean(toggles.privacyMode),
      onToggle: (checked) => {
        setFieldValue('usePrivacyMode', checked);
      },
      label: "Privacy-Mode",
      icon: HiShieldCheck,
      description: "Verwendet deutsche Server der Netzbegrünung.",
      tabIndex: tabIndex?.privacyMode || 13
  }), [toggles.privacyMode, setFieldValue, tabIndex?.privacyMode]);

  const proModeToggle = useMemo(() => {
      if (!generatorType || !features.includes('proMode')) {
        return null;
      }

      return {
        isActive: Boolean(toggles.proMode),
        onToggle: (checked) => {
          setFieldValue('useProMode', checked);
        },
        label: "Pro-Mode",
        description: "Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte."
      };
  }, [generatorType, features, toggles.proMode, setFieldValue]);

  // Unified submission handler
  const onSubmitGenerator = useCallback(async (rhfData) => {
      if (!generatorType) return;
      setStoreIsLoading(true);

      try {
        const formDataToSubmit = {
          ...rhfData,
          useWebSearchTool: rhfData.useWebSearchTool,
          usePrivacyMode: rhfData.usePrivacyMode,
          useProMode: rhfData.useProMode,
          useBedrock: false,
          attachments: processedAttachments
        };

        // Extract search query from form data for intelligent document content
        const extractQueryFromFormData = (data) => {
          const queryParts = [];
          // Common field extraction
          if (data.thema) queryParts.push(data.thema);
          if (data.details) queryParts.push(data.details);
          if (data.idee) queryParts.push(data.idee);
          if (data.zitatgeber) queryParts.push(data.zitatgeber);
          if (data.gliederung) queryParts.push(data.gliederung);
          if (data.hauptthema) queryParts.push(data.hauptthema);
          if (data.anliegen) queryParts.push(data.anliegen);
          if (data.topic) queryParts.push(data.topic);
          if (data.subject) queryParts.push(data.subject);
          if (data.zielgruppe) queryParts.push(data.zielgruppe);
          if (data.context) queryParts.push(data.context);
          if (data.beschreibung) queryParts.push(data.beschreibung);
          if (data.inhalt) queryParts.push(data.inhalt);
          if (data.anfrage) queryParts.push(data.anfrage);
          if (data.gremium) queryParts.push(data.gremium);
          if (data.kontext) queryParts.push(data.kontext);

          return queryParts.filter(part => part && part.trim()).join(' ');
        };

        const searchQuery = extractQueryFromFormData(formDataToSubmit);

        // Get instructions for backend (if active)
        const customPrompt = isInstructionsActive && getActiveInstruction
          ? getActiveInstruction(instructionType)
          : null;

        // Send only IDs and searchQuery - backend handles all content extraction
        formDataToSubmit.customPrompt = customPrompt;
        formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
        formDataToSubmit.selectedTextIds = selectedTextIds || [];
        formDataToSubmit.searchQuery = searchQuery || '';
        formDataToSubmit.useAutomaticSearch = useAutomaticSearch || false;

        // Debug logging
        if (process.env.NODE_ENV === 'development') {
          console.log('[useBaseForm] Submitting with IDs:', {
            selectedDocumentIds: formDataToSubmit.selectedDocumentIds.length,
            selectedTextIds: formDataToSubmit.selectedTextIds.length,
            hasSearchQuery: Boolean(formDataToSubmit.searchQuery),
            hasCustomPrompt: Boolean(formDataToSubmit.customPrompt),
            useAutomaticSearch: formDataToSubmit.useAutomaticSearch
          });
        }

        const response = await submitForm(formDataToSubmit);
        if (response) {
          const content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};

          if (content) {
            setGeneratedText(componentName, content, metadata);
            setTimeout(resetSuccess, 3000);
          }
        }
      } catch (submitError) {
        console.error(`[${generatorType}] Error submitting form:`, submitError);
      } finally {
        setStoreIsLoading(false);
      }
  }, [generatorType, submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, isInstructionsActive, getActiveInstruction, processedAttachments, componentName, instructionType, selectedDocumentIds, selectedTextIds, useAutomaticSearch]);

  // Generated content handling
  const generatedContent = useGeneratedTextStore(state => state.getGeneratedText(componentName)) || '';

  const handleGeneratedContentChange = useCallback((content) => {
      setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Base form props compilation
  const baseFormProps = useMemo(() => ({
      title: helpContent?.title || `${generatorType} Generator`,
      loading,
      success,
      error,
      generatedContent,
      onGeneratedContentChange: handleGeneratedContentChange,
      enableKnowledgeSelector: !disableKnowledgeSystem,
      enableDocumentSelector: !disableKnowledgeSystem,
      showProfileSelector: !disableKnowledgeSystem,
      enablePlatformSelector,
      platformOptions,
      helpContent,
      componentName,
      webSearchFeatureToggle: features.includes('webSearch') ? webSearchFeatureToggle : undefined,
      useWebSearchFeatureToggle: features.includes('webSearch'),
      privacyModeToggle: features.includes('privacyMode') ? privacyModeToggle : undefined,
      usePrivacyModeToggle: features.includes('privacyMode'),
      proModeToggle: features.includes('proMode') ? proModeToggle : undefined,
      useProModeToggle: features.includes('proMode'),
      useFeatureIcons,
      onAttachmentClick: handleAttachmentClick,
      onRemoveFile: handleRemoveFile,
      attachedFiles,
      featureIconsTabIndex: {
        webSearch: tabIndex?.webSearch,
        privacyMode: tabIndex?.privacyMode,
        attachment: tabIndex?.attachment
      },
      platformSelectorTabIndex: baseFormTabIndex?.platformSelectorTabIndex,
      knowledgeSelectorTabIndex: baseFormTabIndex?.knowledgeSelectorTabIndex,
      knowledgeSourceSelectorTabIndex: baseFormTabIndex?.knowledgeSourceSelectorTabIndex,
      documentSelectorTabIndex: baseFormTabIndex?.documentSelectorTabIndex,
      submitButtonTabIndex: baseFormTabIndex?.submitButtonTabIndex,
      formControl: control
  }), [
      helpContent, generatorType, loading, success, error, generatedContent,
      handleGeneratedContentChange, disableKnowledgeSystem, enablePlatformSelector, platformOptions,
      componentName, features, webSearchFeatureToggle, privacyModeToggle, proModeToggle,
      handleAttachmentClick, handleRemoveFile, attachedFiles, tabIndex, baseFormTabIndex,
      control, useFeatureIcons
  ]);

  // Build generator logic object (conditionally included in return)
  const generatorLogic = generatorType ? {
      loading,
      success,
      error,
      resetSuccess,
      attachedFiles,
      handleAttachmentClick,
      handleRemoveFile,
      onSubmit: handleSubmit(onSubmitGenerator),
      generatedContent,
      handleGeneratedContentChange,
      toggles,
      tabIndex,
      baseFormTabIndex,
      baseFormProps
  } : null;

  // Return simplified form interface
  return {
    // React-Hook-Form core methods
    control,
    handleSubmit,
    reset: enhancedReset,
    setValue: setFieldValue,
    getValue,
    getValues,
    trigger: validateForm,
    clearErrors: clearFieldErrors,
    setError: setFieldError,

    // Form state
    formData: getValues(),
    errors,
    isDirty,
    isValid,
    isSubmitted,
    isSubmitting,
    isLoading,
    isSubmitSuccessful,
    submitCount,
    touchedFields,
    dirtyFields,

    // Validation
    validateForm,

    // Error handling
    globalError,
    setGlobalError,
    getErrorMessage,
    handleSubmitError,
    clearGlobalError,

    // Utility functions
    utils: {
      hasErrors: Object.keys(errors).length > 0,
      getFieldError: (name) => errors[name]?.message || errors[name],
      isFieldTouched: (name) => !!touchedFields[name],
      isFieldDirty: (name) => !!dirtyFields[name],
      resetField: (name) => {
        setValue(name, defaultValues[name] || '');
        clearErrors(name);
      }
    },

    // Generator-specific properties (only when generatorType is provided)
    ...(generatorLogic && { generator: generatorLogic })
  };
};

export default useBaseForm; 
