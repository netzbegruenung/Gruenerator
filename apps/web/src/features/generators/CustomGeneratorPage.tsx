import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useParams } from 'react-router-dom';

import BaseForm from '../../components/common/BaseForm';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';
import '../../assets/styles/components/ui/button.css';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import apiClient from '../../components/utils/apiClient';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';

import DynamicFormFieldRenderer from './components/DynamicFormFieldRenderer';
import { type GeneratorConfig, DEFAULT_FEATURE_TOGGLES } from './types/generatorTypes';

import type { HelpContent, BaseFormProps } from '../../types/baseform';

const CustomGeneratorPage: React.FC = memo(() => {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const [generatorConfig, setGeneratorConfig] = useState<GeneratorConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [localGeneratedContent, setLocalGeneratedContent] = useState<string>('');
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  const { setGeneratedText } = useGeneratedTextStore();

  // URL crawler hook for automatic link processing
  const { crawledUrls, isCrawling, detectAndCrawlUrls } = useUrlCrawler();

  // API submission hook for loading state management
  const {
    submitForm,
    loading: isSubmitting,
    success: submissionSuccess,
    resetSuccess,
    error: submissionError,
  } = useApiSubmit('/custom_generator');

  // Memoize default values for the form
  const defaultValues = useMemo<Record<string, unknown>>(() => {
    const values: Record<string, unknown> = { ...DEFAULT_FEATURE_TOGGLES };
    if (generatorConfig) {
      generatorConfig.form_schema.fields.forEach((field) => {
        values[field.name] = field.defaultValue || '';
      });
    }
    return values;
  }, [generatorConfig]);

  // Memoize help content
  const helpContent = useMemo<HelpContent>(
    () => ({
      content: generatorConfig?.description || 'Benutzerdefinierter Grünerator',
      tips: ['Fülle alle erforderlichen Felder aus'],
    }),
    [generatorConfig?.description]
  );

  const form = useBaseForm({
    defaultValues,
    generatorType: 'custom-generator',
    componentName: 'customGenerator',
    endpoint: '/custom_generator',
    instructionType: 'custom_generator',
    tabIndexKey: 'CUSTOM_GENERATOR',
    helpContent,
    useFeatureIcons: false,
    disableKnowledgeSystem: true,
  } as unknown as Parameters<typeof useBaseForm>[0]);

  // Reset form when generator config changes
  useEffect(() => {
    if (generatorConfig) {
      const newDefaults: Record<string, unknown> = { ...DEFAULT_FEATURE_TOGGLES };
      generatorConfig.form_schema.fields.forEach((field) => {
        newDefaults[field.name] = field.defaultValue || '';
      });
      form.reset(newDefaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatorConfig]);

  useEffect(() => {
    const fetchGeneratorConfig = async () => {
      if (!slug) return;
      if (!isAuthenticated || !user?.id) {
        setError('Authentifizierung erforderlich');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setLocalGeneratedContent('');
      setGeneratedText('customGenerator', '');
      try {
        const response = await apiClient.get(`/custom_generator/${slug}`);
        const data = response.data;
        const generator = data.generator || data;

        if (generator) {
          setGeneratorConfig(generator);
          setIsOwner(generator.is_owner || false);
          setIsSaved(generator.is_saved || false);
        } else {
          setError('Generator nicht gefunden.');
        }
      } catch (err) {
        console.error('Error fetching generator config:', err);
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          setError('Generator nicht gefunden.');
        } else {
          setError('Fehler beim Laden des Generators.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      void fetchGeneratorConfig();
    }
  }, [slug, isAuthenticated, user?.id, authLoading]);

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (!isCrawling && urls.length > 0 && form.generator) {
        const { toggles } = form.generator as unknown as { toggles: { privacyMode: boolean } };
        await detectAndCrawlUrls(urls.join(' '), toggles.privacyMode);
      }
    },
    [detectAndCrawlUrls, isCrawling, form.generator]
  );

  // Custom submission handler for dynamic generator configuration
  const customSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      try {
        // Create clean form data object - only include fields from generator config
        const cleanFormData: Record<string, unknown> = {};
        if (generatorConfig) {
          generatorConfig.form_schema.fields.forEach((field) => {
            cleanFormData[field.name] = formData[field.name] || '';
          });
        }

        // Combine file attachments with crawled URLs
        const allAttachments = form.generator
          ? [...form.generator.attachedFiles, ...crawledUrls]
          : crawledUrls;

        // Add feature flags and attachments to form data
        if (form.generator) {
          const { toggles } = form.generator as unknown as {
            toggles: { webSearch: boolean; privacyMode: boolean; proMode: boolean };
          };
          cleanFormData.useWebSearchTool = toggles.webSearch;
          cleanFormData.usePrivacyMode = toggles.privacyMode;
          cleanFormData.useBedrock = toggles.proMode; // Pro mode flag for backend API
        }
        cleanFormData.attachments = allAttachments;

        // Use submitForm instead of apiClient.post for automatic loading state management
        const response = await submitForm({
          slug,
          formData: cleanFormData,
        });

        const content =
          (response as { content?: string; data?: { content?: string } })?.content ||
          (response as { data?: { content?: string } })?.data?.content ||
          (response as { data?: string })?.data ||
          response;

        if (content) {
          setLocalGeneratedContent(String(content));
          if (form.generator) {
            form.generator.handleGeneratedContentChange(String(content));
          }
          setTimeout(resetSuccess, 3000);
        } else {
          setLocalGeneratedContent('');
        }
      } catch (err) {
        console.error('Fehler bei der Generierung:', err);
        setLocalGeneratedContent('');
      }
    },
    [submitForm, resetSuccess, generatorConfig, form, slug, crawledUrls]
  );

  const handleGeneratedContentChange = useCallback(
    (content: string) => {
      setLocalGeneratedContent(content);
      if (form.generator) {
        form.generator.handleGeneratedContentChange(content);
      }
    },
    [form.generator]
  );

  // Handle saving generator to user's profile
  const handleSaveGenerator = useCallback(async () => {
    if (!generatorConfig?.id || isSaving || isSaved || isOwner) return;

    setIsSaving(true);
    try {
      await apiClient.post(`/auth/saved_generators/${generatorConfig.id}`);
      setIsSaved(true);
    } catch (err) {
      console.error('Error saving generator:', err);
    } finally {
      setIsSaving(false);
    }
  }, [generatorConfig?.id, isSaving, isSaved, isOwner]);

  // Memoize saved button style
  const savedButtonStyle = useMemo(
    () => (isSaved ? { backgroundColor: 'var(--klee)', cursor: 'default' } : {}),
    [isSaved]
  );

  // Memoize save button component for non-owners
  const saveButton = useMemo(
    () =>
      !isOwner ? (
        <button
          type="button"
          className={`btn-primary size-s ${isSaved ? 'saved' : ''}`}
          onClick={handleSaveGenerator}
          disabled={isSaving || isSaved}
          title={isSaved ? 'Bereits gespeichert' : 'In meinem Profil speichern'}
          style={savedButtonStyle}
        >
          {isSaving ? 'Speichern...' : isSaved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      ) : null,
    [isOwner, isSaved, isSaving, handleSaveGenerator, savedButtonStyle]
  );

  // Memoize submit button props
  const submitButtonProps = useMemo(
    () => ({
      defaultText: 'Grünerieren',
    }),
    []
  );

  // Memoize onSubmit handler
  const handleFormSubmit = useCallback(() => {
    const submitHandler = form.handleSubmit(async (data: unknown) => {
      await customSubmit(data as unknown as Record<string, unknown>);
    });
    return submitHandler();
  }, [form, customSubmit]);

  // Memoize baseFormProps - use safe defaults when generatorConfig is null
  const baseFormProps = useMemo<BaseFormProps>(
    () => ({
      ...((form.generator?.baseFormProps as unknown as BaseFormProps) || {}),
      title: generatorConfig?.name || generatorConfig?.title || '',
      onSubmit: handleFormSubmit,
      loading: isSubmitting,
      success: submissionSuccess,
      error: submissionError,
      generatedContent: localGeneratedContent,
      onGeneratedContentChange: handleGeneratedContentChange,
      submitButtonProps,
      showProfileSelector: false,
      firstExtrasChildren: saveButton,
    }),
    [
      form.generator?.baseFormProps,
      generatorConfig?.name,
      generatorConfig?.title,
      handleFormSubmit,
      isSubmitting,
      submissionSuccess,
      submissionError,
      localGeneratedContent,
      handleGeneratedContentChange,
      submitButtonProps,
      saveButton,
    ]
  );

  // Early returns AFTER all hooks are called
  if (loading) return <div>Lade...</div>;
  if (error) return <div>Fehler: {error}</div>;
  if (!generatorConfig) return <div>Generator nicht gefunden</div>;

  return (
    <ErrorBoundary>
      <div className="custom-generator-page-container container with-header">
        <BaseForm {...baseFormProps}>
          <DynamicFormFieldRenderer
            fields={generatorConfig.form_schema.fields}
            control={form.control}
            onUrlsDetected={handleUrlsDetected}
            enableUrlDetection={true}
          />
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
});

CustomGeneratorPage.displayName = 'CustomGeneratorPage';

export default CustomGeneratorPage;
