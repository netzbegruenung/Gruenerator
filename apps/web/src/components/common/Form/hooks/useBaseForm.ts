import { useForm, useWatch, Control, UseFormProps, FieldValues } from 'react-hook-form';
import { useCallback, useState, useMemo, useEffect } from 'react';
import useApiSubmit from '../../../hooks/useApiSubmit';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import { useDocumentsStore } from '../../../../stores/documentsStore';
import { useTabIndex, useBaseFormTabIndex } from '../../../../hooks/useTabIndex';
import { prepareFilesForSubmission } from '../../../../utils/fileAttachmentUtils';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import type { FeatureToggle as FeatureToggleType } from '../../../../types/baseform';

/**
 * Feature toggles configuration
 */
interface FeatureToggles {
  webSearch: boolean;
  privacyMode: boolean;
  proMode: boolean;
}

/**
 * Generator logic object returned when generatorType is provided
 */
interface GeneratorLogic {
  loading: boolean;
  success: boolean;
  error: unknown;
  resetSuccess: () => void;
  attachedFiles: unknown[];
  handleAttachmentClick: (files: File[]) => Promise<void>;
  handleRemoveFile: (index: number) => void;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  generatedContent: string | Record<string, unknown>;
  handleGeneratedContentChange: (content: string) => void;
  toggles: FeatureToggles;
  tabIndex: unknown;
  baseFormTabIndex: unknown;
  baseFormProps: Record<string, unknown>;
}

/**
 * Return type for the useBaseForm hook
 */
interface UseBaseFormReturn {
  // React-Hook-Form core methods
  control: Control<FieldValues>;
  handleSubmit: ReturnType<typeof useForm>['handleSubmit'];
  reset: (values?: Record<string, unknown>) => void;
  setValue: (name: string, value: unknown, options?: Record<string, unknown>) => void;
  getValues: ReturnType<typeof useForm>['getValues'];
  trigger: () => Promise<boolean>;
  clearErrors: (names?: string | string[]) => void;
  setError: (name: string, error: string) => void;

  // Form state
  formData: Record<string, unknown>;
  errors: Record<string, unknown>;
  isDirty: boolean;
  isValid: boolean;
  isSubmitted: boolean;
  isSubmitting: boolean;
  isLoading: boolean;
  isSubmitSuccessful: boolean;
  submitCount: number;
  touchedFields: Record<string, boolean>;
  dirtyFields: Record<string, boolean>;

  // Validation
  validateForm: () => Promise<boolean>;

  // Error handling
  globalError: string;
  setGlobalError: (error: string) => void;
  getErrorMessage: (error: unknown) => string;
  handleSubmitError: (error: unknown) => void;
  clearGlobalError: () => void;

  // Utility functions
  utils: {
    hasErrors: boolean;
    getFieldError: (name: string) => unknown;
    isFieldTouched: (name: string) => boolean;
    isFieldDirty: (name: string) => boolean;
    resetField: (name: string) => void;
  };

  // Generator-specific properties (only when generatorType is provided)
  generator?: GeneratorLogic;
}

/**
 * Configuration options for the useBaseForm hook
 */
interface UseBaseFormOptions extends Omit<UseFormProps<FieldValues>, 'defaultValues'> {
  defaultValues?: Record<string, unknown>;
  // Generator-specific configuration
  generatorType?: string | null;
  componentName?: string | null;
  endpoint?: string | null;
  instructionType?: string | null;
  features?: string[];
  tabIndexKey?: string | null;
  helpContent?: unknown;
  platformOptions?: unknown;
  enablePlatformSelector?: boolean;
  disableKnowledgeSystem?: boolean;
  useFeatureIcons?: boolean;
  defaultMode?: unknown;
}

/**
 * Helper hook to watch and memoize feature toggles
 */
const useFeatureToggles = (control: Control<FieldValues>, defaultValues: Record<string, unknown>): FeatureToggles => {
  const webSearch = useWatch({
    control,
    name: 'useWebSearchTool',
    defaultValue: (defaultValues.useWebSearchTool ?? false) as boolean
  });

  const privacyMode = useWatch({
    control,
    name: 'usePrivacyMode',
    defaultValue: (defaultValues.usePrivacyMode ?? false) as boolean
  });

  const proMode = useWatch({
    control,
    name: 'useProMode',
    defaultValue: (defaultValues.useProMode ?? false) as boolean
  });

  return useMemo(() => ({
    webSearch,
    privacyMode,
    proMode
  }), [webSearch, privacyMode, proMode]);
};

/**
 * Simplified BaseForm Hook für react-hook-form Integration
 * Dünner Wrapper um useForm mit einigen Utility-Funktionen
 * @param {UseBaseFormOptions} config - Hook-Konfiguration
 * @returns {UseBaseFormReturn} Form-Funktionen und Zustand
 */
const useBaseForm = ({
  defaultValues = {},
  mode = 'onSubmit',
  reValidateMode = 'onSubmit',
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
  defaultMode = null,

  ...restOptions
}: UseBaseFormOptions = {}): UseBaseFormReturn => {

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

  // Tab index hooks - pass undefined (not null) when not needed to avoid warnings
  const tabIndex = useTabIndex((tabIndexKey ?? undefined) as string | undefined);
  const baseFormTabIndex = useBaseFormTabIndex((tabIndexKey ?? undefined) as string | undefined);

  // Store hooks
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const { setUIConfig, setAvailableDocuments, setAvailableTexts } = useGeneratorSelectionStore();
  const { fetchCombinedContent, documents: documentsFromStore, texts: textsFromStore } = useDocumentsStore();

  // State hooks
  const [attachedFiles, setAttachedFiles] = useState<unknown[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<unknown[]>([]);

  // API hook - pass empty string when not needed
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit(generatorType && endpoint ? endpoint : '');

  // Enhanced reset function that preserves original API
  const enhancedReset = useCallback((values: Record<string, unknown> = defaultValues) => {
    reset(values);
  }, [reset, defaultValues]);

  // Enhanced set field value with better defaults
  const setFieldValue = useCallback((name: string, value: unknown, options: Record<string, unknown> = {}) => {
    setValue(name, value, {
      shouldValidate: true,
      shouldDirty: true,
      ...options
    });
  }, [setValue]);

  // Enhanced set field error
  const setFieldError = useCallback((name: string, error: string) => {
    setError(name, {
      type: 'manual',
      message: error
    });
  }, [setError]);

  // Enhanced clear field errors
  const clearFieldErrors = useCallback((names?: string | string[]) => {
    if (Array.isArray(names)) {
      names.forEach(name => clearErrors(name));
    } else if (names) {
      clearErrors(names);
    } else {
      clearErrors();
    }
  }, [clearErrors]);

  // Validation function
  const validateForm = useCallback(async (): Promise<boolean> => {
    return await trigger();
  }, [trigger]);

  // Error handling state and functions
  const [globalError, setGlobalError] = useState<string>('');

  /**
   * Generates user-friendly error message based on error code
   * @param {unknown} error - Error text or code
   * @returns {string} User-friendly error message
   */
  const getErrorMessage = useCallback((error: unknown): string => {
    if (!error) return '';

    const errorString = typeof error === 'string' ? error : (error instanceof Error) ? error.message : String(error);

    const errorMessages: Record<string, string> = {
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
      if (errorString.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }

    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  }, []);

  /**
   * Handles errors during form submission
   * @param {unknown} error - Error object
   */
  const handleSubmitError = useCallback((error: unknown) => {
    console.error('[useBaseForm] Submit error:', error);
    if (error && typeof error === 'object' && 'response' in error) {
      const errorObj = error as Record<string, unknown>;
      if (errorObj.response && typeof errorObj.response === 'object') {
        const response = errorObj.response as Record<string, unknown>;
        if (response.status) {
          setGlobalError(String(response.status));
        }
      }
    } else if (error instanceof Error) {
      setGlobalError(error.message);
    } else if (typeof error === 'string') {
      setGlobalError(error);
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
      fetchCombinedContent().catch((error: unknown) => {
        console.error('[useBaseForm] Failed to fetch combined content:', error);
      });
    }
  }, [generatorType, disableKnowledgeSystem, setUIConfig, fetchCombinedContent]);

  // Sync documents from documentsStore to generatorSelectionStore
  // Note: documentsStore and generatorSelectionStore have incompatible Document type definitions
  // Both have required 'id' property so data is compatible despite type checker differences
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && documentsFromStore) {
      setAvailableDocuments(documentsFromStore as unknown as Parameters<typeof setAvailableDocuments>[0]);
    }
  }, [generatorType, disableKnowledgeSystem, documentsFromStore, setAvailableDocuments]);

  // Sync texts from documentsStore to generatorSelectionStore
  // Note: documentsStore and generatorSelectionStore have incompatible Text type definitions
  // Both have required 'id' property so data is compatible despite type checker differences
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && textsFromStore) {
      setAvailableTexts(textsFromStore as unknown as Parameters<typeof setAvailableTexts>[0]);
    }
  }, [generatorType, disableKnowledgeSystem, textsFromStore, setAvailableTexts]);

  // Selection store integration - always get store, conditionally use values
  const selectionStore = useGeneratorSelectionStore();

  // Track component switches and apply default modes
  useEffect(() => {
    if (componentName && generatorType) {
      const { setActiveComponent } = useGeneratorSelectionStore.getState();

      // This will:
      // 1. Detect if we switched to a new component
      // 2. Reset features when switching
      // 3. Apply this component's default mode (from store or param)
      setActiveComponent(componentName, defaultMode as unknown as ('privacy' | 'pro' | 'ultra' | 'balanced') | null | undefined);
    }
  }, [componentName, generatorType]); // Re-run when component changes

  // Conditionally extract values based on knowledge system status
  const source = (!generatorType || disableKnowledgeSystem) ? { type: 'neutral' as const } : selectionStore.source;
  const isInstructionsActive = (!generatorType || disableKnowledgeSystem) ? false : selectionStore.isInstructionsActive;
  const instructions = (!generatorType || disableKnowledgeSystem) ? {} : selectionStore.instructions;
  const getActiveInstruction = (!generatorType || disableKnowledgeSystem) ? () => null : selectionStore.getActiveInstruction;
  const selectedDocumentIds = (!generatorType || disableKnowledgeSystem) ? [] : selectionStore.selectedDocumentIds;
  const selectedTextIds = (!generatorType || disableKnowledgeSystem) ? [] : selectionStore.selectedTextIds;
  const useAutomaticSearch = (!generatorType || disableKnowledgeSystem) ? false : selectionStore.useAutomaticSearch;

  // File attachment handlers - always define, conditionally use
  const handleAttachmentClick = useCallback(async (files: File[]) => {
    if (!generatorType) return;
    try {
      const processed = await prepareFilesForSubmission(files);
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error: unknown) {
      console.error(`[${generatorType}] File processing error:`, error);
    }
  }, [generatorType]);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  // Feature toggles configuration
  const webSearchFeatureToggle = useMemo((): FeatureToggleType => ({
      isActive: Boolean(toggles.webSearch),
      onToggle: (checked: boolean) => {
        setFieldValue('useWebSearchTool', checked);
      },
      label: "Websuche verwenden",
      icon: HiGlobeAlt,
      description: "",
      tabIndex: (tabIndex as Record<string, unknown>)?.webSearch as number || 11
  }), [toggles.webSearch, setFieldValue, tabIndex]);

  const privacyModeToggle = useMemo((): FeatureToggleType => ({
      isActive: Boolean(toggles.privacyMode),
      onToggle: (checked: boolean) => {
        setFieldValue('usePrivacyMode', checked);
      },
      label: "Privacy-Mode",
      icon: HiShieldCheck,
      description: "Verwendet deutsche Server der Netzbegrünung.",
      tabIndex: (tabIndex as Record<string, unknown>)?.privacyMode as number || 13
  }), [toggles.privacyMode, setFieldValue, tabIndex]);

  const proModeToggle = useMemo((): FeatureToggleType | null => {
      if (!generatorType || !features.includes('proMode')) {
        return null;
      }

      return {
        isActive: Boolean(toggles.proMode),
        onToggle: (checked: boolean) => {
          setFieldValue('useProMode', checked);
        },
        label: "Pro-Mode",
        description: "Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte."
      };
  }, [generatorType, features, toggles.proMode, setFieldValue]);

  // Unified submission handler
  const onSubmitGenerator = useCallback(async (rhfData: Record<string, unknown>) => {
      if (!generatorType) return;
      setStoreIsLoading(true);

      try {
        const formDataToSubmit: Record<string, unknown> = {
          ...rhfData,
          useWebSearchTool: rhfData.useWebSearchTool,
          usePrivacyMode: rhfData.usePrivacyMode,
          useProMode: rhfData.useProMode,
          useBedrock: false,
          attachments: processedAttachments
        };

        // Extract search query from form data for intelligent document content
        const extractQueryFromFormData = (data: Record<string, unknown>): string => {
          const queryParts: string[] = [];
          // Common field extraction
          if (data.thema) queryParts.push(String(data.thema));
          if (data.details) queryParts.push(String(data.details));
          if (data.idee) queryParts.push(String(data.idee));
          if (data.zitatgeber) queryParts.push(String(data.zitatgeber));
          if (data.gliederung) queryParts.push(String(data.gliederung));
          if (data.hauptthema) queryParts.push(String(data.hauptthema));
          if (data.anliegen) queryParts.push(String(data.anliegen));
          if (data.topic) queryParts.push(String(data.topic));
          if (data.subject) queryParts.push(String(data.subject));
          if (data.zielgruppe) queryParts.push(String(data.zielgruppe));
          if (data.context) queryParts.push(String(data.context));
          if (data.beschreibung) queryParts.push(String(data.beschreibung));
          if (data.inhalt) queryParts.push(String(data.inhalt));
          if (data.anfrage) queryParts.push(String(data.anfrage));
          if (data.gremium) queryParts.push(String(data.gremium));
          if (data.kontext) queryParts.push(String(data.kontext));

          return queryParts.filter(part => part && part.trim()).join(' ');
        };

        const searchQuery = extractQueryFromFormData(formDataToSubmit);

        // Get instructions for backend (if active)
        const customPrompt = isInstructionsActive && instructionType
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
            selectedDocumentIds: (formDataToSubmit.selectedDocumentIds as unknown[]).length,
            selectedTextIds: (formDataToSubmit.selectedTextIds as unknown[]).length,
            hasSearchQuery: Boolean(formDataToSubmit.searchQuery),
            hasCustomPrompt: Boolean(formDataToSubmit.customPrompt),
            useAutomaticSearch: formDataToSubmit.useAutomaticSearch
          });
        }

        const response = await submitForm(formDataToSubmit);
        if (response && componentName) {
          const content = typeof response === 'string' ? response : (response as Record<string, unknown>).content;
          const metadata = typeof response === 'object' ? (response as Record<string, unknown>).metadata : {};

          if (content) {
            setGeneratedText(componentName, content, metadata);
            setTimeout(resetSuccess, 3000);
          }
        }
      } catch (submitError: unknown) {
        console.error(`[${generatorType}] Error submitting form:`, submitError);
      } finally {
        setStoreIsLoading(false);
      }
  }, [generatorType, submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, isInstructionsActive, getActiveInstruction, processedAttachments, componentName, instructionType, selectedDocumentIds, selectedTextIds, useAutomaticSearch]);

  // Generated content handling
  const generatedContent = useGeneratedTextStore(state => state.getGeneratedText(componentName ?? '')) || '';

  const handleGeneratedContentChange = useCallback((content: string) => {
      if (componentName) {
        setGeneratedText(componentName, content);
      }
  }, [setGeneratedText, componentName]);

  // Base form props compilation
  const baseFormProps = useMemo(() => ({
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
      componentName: componentName ?? '',
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
        webSearch: (tabIndex as Record<string, unknown>)?.webSearch,
        privacyMode: (tabIndex as Record<string, unknown>)?.privacyMode,
        attachment: (tabIndex as Record<string, unknown>)?.attachment
      },
      platformSelectorTabIndex: (baseFormTabIndex as Record<string, unknown>)?.platformSelectorTabIndex,
      knowledgeSelectorTabIndex: (baseFormTabIndex as Record<string, unknown>)?.knowledgeSelectorTabIndex,
      knowledgeSourceSelectorTabIndex: (baseFormTabIndex as Record<string, unknown>)?.knowledgeSourceSelectorTabIndex,
      documentSelectorTabIndex: (baseFormTabIndex as Record<string, unknown>)?.documentSelectorTabIndex,
      submitButtonTabIndex: (baseFormTabIndex as Record<string, unknown>)?.submitButtonTabIndex,
      formControl: control
  }), [
      helpContent, generatorType, loading, success, error, generatedContent,
      handleGeneratedContentChange, disableKnowledgeSystem, enablePlatformSelector, platformOptions,
      componentName, features, webSearchFeatureToggle, privacyModeToggle, proModeToggle,
      handleAttachmentClick, handleRemoveFile, attachedFiles, tabIndex, baseFormTabIndex,
      control, useFeatureIcons
  ]);

  // Build generator logic object (conditionally included in return)
  const generatorLogic: GeneratorLogic | null = generatorType ? {
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
      getFieldError: (name: string) => (errors[name] as Record<string, unknown>)?.message || errors[name],
      isFieldTouched: (name: string) => !!touchedFields[name],
      isFieldDirty: (name: string) => !!dirtyFields[name],
      resetField: (name: string) => {
        setValue(name, (defaultValues[name] ?? '') as FieldValues);
        clearErrors(name);
      }
    },

    // Generator-specific properties (only when generatorType is provided)
    ...(generatorLogic && { generator: generatorLogic })
  };
};

export default useBaseForm;
