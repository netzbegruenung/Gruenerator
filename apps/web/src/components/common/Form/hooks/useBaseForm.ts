import { useCallback, useState, useMemo } from 'react';
import { useForm, type Control, type UseFormProps, type FieldValues } from 'react-hook-form';

import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useTabIndex } from '../../../../hooks/useTabIndex';

import useFormAttachments from './useFormAttachments';
import useFormFeatures from './useFormFeatures';
import useKnowledgeSystem from './useKnowledgeSystem';
import useStreamingFormSubmission from './useStreamingFormSubmission';

interface FeatureToggles {
  webSearch: boolean;
  privacyMode: boolean;
  proMode: boolean;
}

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
  baseFormProps: Record<string, unknown>;
  isStreaming: boolean;
  abortStreaming: () => void;
  submitForm: (formData: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface UseBaseFormReturn {
  control: Control<FieldValues>;
  handleSubmit: ReturnType<typeof useForm>['handleSubmit'];
  reset: (values?: Record<string, unknown>) => void;
  setValue: (name: string, value: unknown, options?: Record<string, unknown>) => void;
  getValues: ReturnType<typeof useForm>['getValues'];
  trigger: () => Promise<boolean>;
  clearErrors: (names?: string | string[]) => void;
  setError: (name: string, error: string) => void;
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
  validateForm: () => Promise<boolean>;
  globalError: string;
  setGlobalError: (error: string) => void;
  getErrorMessage: (error: unknown) => string;
  handleSubmitError: (error: unknown) => void;
  clearGlobalError: () => void;
  utils: {
    hasErrors: boolean;
    getFieldError: (name: string) => unknown;
    isFieldTouched: (name: string) => boolean;
    isFieldDirty: (name: string) => boolean;
    resetField: (name: string) => void;
  };
  generator?: GeneratorLogic;
}

interface UseBaseFormOptions extends Omit<UseFormProps<FieldValues>, 'defaultValues'> {
  defaultValues?: Record<string, unknown>;
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

// Extract search query from form fields for knowledge-enriched submission
const extractQueryFromFormData = (data: Record<string, unknown>): string => {
  const queryFields = [
    'thema',
    'details',
    'idee',
    'zitatgeber',
    'gliederung',
    'hauptthema',
    'anliegen',
    'topic',
    'subject',
    'zielgruppe',
    'context',
    'beschreibung',
    'inhalt',
    'anfrage',
    'gremium',
    'kontext',
  ];
  return queryFields
    .map((field) => data[field])
    .filter((val): val is string => typeof val === 'string' && val.trim() !== '')
    .join(' ');
};

const useBaseForm = ({
  defaultValues = {},
  mode = 'onSubmit',
  reValidateMode = 'onSubmit',
  criteriaMode = 'firstError',
  shouldFocusError = true,
  shouldUnregister = false,
  shouldUseNativeValidation = false,
  delayError = undefined,
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
  // ── React-Hook-Form ──────────────────────────────────────────────────
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
      dirtyFields,
    },
  } = useForm({
    defaultValues,
    mode,
    reValidateMode,
    criteriaMode,
    shouldFocusError,
    shouldUnregister,
    shouldUseNativeValidation,
    delayError,
    ...restOptions,
  });

  // ── Auxiliary hooks (must be called unconditionally) ──────────────────
  useOptimizedAuth();
  const tabIndex = useTabIndex((tabIndexKey ?? undefined) as string | undefined);

  // ── Composed hooks ───────────────────────────────────────────────────
  const hasEndpoint = !!(generatorType && endpoint);

  const submission = useStreamingFormSubmission(endpoint || '', componentName || '', hasEndpoint);

  const setFieldValue = useCallback(
    (name: string, value: unknown, options: Record<string, unknown> = {}) => {
      setValue(name, value, { shouldValidate: true, shouldDirty: true, ...options });
    },
    [setValue]
  );

  const { toggles, featuresConfig } = useFormFeatures(
    control,
    defaultValues,
    features,
    generatorType,
    setFieldValue
  );

  const attachments = useFormAttachments(generatorType);

  const knowledge = useKnowledgeSystem(
    generatorType,
    componentName,
    disableKnowledgeSystem,
    defaultMode
  );

  // ── Enhanced RHF methods ─────────────────────────────────────────────
  const enhancedReset = useCallback(
    (values: Record<string, unknown> = defaultValues) => reset(values),
    [reset, defaultValues]
  );

  const setFieldError = useCallback(
    (name: string, error: string) => setError(name, { type: 'manual', message: error }),
    [setError]
  );

  const clearFieldErrors = useCallback(
    (names?: string | string[]) => {
      if (Array.isArray(names)) names.forEach((n) => clearErrors(n));
      else if (names) clearErrors(names);
      else clearErrors();
    },
    [clearErrors]
  );

  const validateForm = useCallback(async (): Promise<boolean> => trigger(), [trigger]);

  // ── Error handling ───────────────────────────────────────────────────
  const [globalError, setGlobalError] = useState<string>('');

  const getErrorMessage = useCallback((error: unknown): string => {
    if (!error) return '';
    const errorString =
      typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
    const errorMessages: Record<string, string> = {
      '400':
        'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403':
        'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404':
        'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429':
        'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
      '500':
        'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
      '529':
        'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.',
    };
    for (const [code, message] of Object.entries(errorMessages)) {
      if (errorString.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }
    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  }, []);

  const handleSubmitError = useCallback((error: unknown) => {
    console.error('[useBaseForm] Submit error:', error);
    if (error && typeof error === 'object' && 'response' in error) {
      const errorObj = error as Record<string, unknown>;
      if (errorObj.response && typeof errorObj.response === 'object') {
        const response = errorObj.response as Record<string, unknown>;
        if (response.status === 400 && response.data && typeof response.data === 'object') {
          const data = response.data as Record<string, unknown>;
          setGlobalError(
            data.error && typeof data.error === 'string' ? data.error : String(response.status)
          );
        } else if (response.status) {
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

  const clearGlobalError = useCallback(() => setGlobalError(''), []);

  // ── Generator submission handler ─────────────────────────────────────
  const onSubmitGenerator = useCallback(
    async (rhfData: Record<string, unknown>) => {
      if (!generatorType) return;
      submission.setStoreIsLoading(true);
      try {
        const formDataToSubmit: Record<string, unknown> = {
          ...rhfData,
          useBedrock: false,
          attachments: attachments.processedAttachments,
          useNotebookEnrich: knowledge.useNotebookEnrich,
          selectedDocumentIds: knowledge.selectedDocumentIds || [],
          selectedTextIds: knowledge.selectedTextIds || [],
          searchQuery: extractQueryFromFormData(rhfData) || '',
          useAutomaticSearch: knowledge.useAutomaticSearch || false,
        };

        const response = await submission.submitForm(formDataToSubmit);
        if (response && componentName) {
          const content =
            typeof response === 'string' ? response : (response as Record<string, unknown>).content;
          const metadata =
            typeof response === 'object'
              ? ((response as Record<string, unknown>).metadata as
                  | Record<string, unknown>
                  | undefined)
              : undefined;
          if (content) {
            submission.setGeneratedText(componentName, content as string, metadata);
            setTimeout(submission.resetSuccess, 3000);
          }
        }
      } catch (submitError: unknown) {
        console.error(`[${generatorType}] Error submitting form:`, submitError);
      } finally {
        submission.setStoreIsLoading(false);
      }
    },
    [generatorType, submission, attachments.processedAttachments, knowledge, componentName]
  );

  // ── baseFormProps assembly ───────────────────────────────────────────
  const baseFormProps = useMemo(
    () => ({
      loading: submission.loading,
      success: submission.success,
      error: submission.error,
      generatedContent: submission.generatedContent,
      onGeneratedContentChange: submission.handleGeneratedContentChange,
      enableKnowledgeSelector: !disableKnowledgeSystem,
      enableDocumentSelector: !disableKnowledgeSystem,
      showProfileSelector: !disableKnowledgeSystem,
      enablePlatformSelector,
      platformOptions,
      helpContent,
      componentName: componentName ?? '',
      features: featuresConfig,
      useFeatureIcons,
      onAttachmentClick: attachments.handleAttachmentClick,
      onRemoveFile: attachments.handleRemoveFile,
      attachedFiles: attachments.attachedFiles,
      formControl: control,
      streamingProgress: submission.streamingProgress,
      isStreaming: submission.isStreaming,
      abortStreaming: submission.abortStreaming,
    }),
    [
      submission,
      disableKnowledgeSystem,
      enablePlatformSelector,
      platformOptions,
      helpContent,
      componentName,
      featuresConfig,
      useFeatureIcons,
      attachments,
      tabIndex,
      control,
    ]
  );

  // ── Generator logic object ───────────────────────────────────────────
  const generatorLogic: GeneratorLogic | null = generatorType
    ? {
        loading: submission.loading,
        success: submission.success,
        error: submission.error,
        resetSuccess: submission.resetSuccess,
        attachedFiles: attachments.attachedFiles,
        handleAttachmentClick: attachments.handleAttachmentClick,
        handleRemoveFile: attachments.handleRemoveFile,
        onSubmit: handleSubmit(onSubmitGenerator),
        generatedContent: submission.generatedContent,
        handleGeneratedContentChange: submission.handleGeneratedContentChange,
        toggles,
        tabIndex,
        baseFormProps,
        isStreaming: submission.isStreaming,
        abortStreaming: submission.abortStreaming,
        submitForm: submission.submitForm,
      }
    : null;

  // ── Return ───────────────────────────────────────────────────────────
  return {
    control,
    handleSubmit,
    reset: enhancedReset,
    setValue: setFieldValue,
    getValues,
    trigger: validateForm,
    clearErrors: clearFieldErrors,
    setError: setFieldError,
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
    validateForm,
    globalError,
    setGlobalError,
    getErrorMessage,
    handleSubmitError,
    clearGlobalError,
    utils: {
      hasErrors: Object.keys(errors).length > 0,
      getFieldError: (name: string) =>
        (errors[name] as Record<string, unknown>)?.message || errors[name],
      isFieldTouched: (name: string) => !!touchedFields[name],
      isFieldDirty: (name: string) => !!dirtyFields[name],
      resetField: (name: string) => {
        setValue(name, (defaultValues[name] ?? '') as FieldValues);
        clearErrors(name);
      },
    },
    ...(generatorLogic && { generator: generatorLogic }),
  };
};

export default useBaseForm;
