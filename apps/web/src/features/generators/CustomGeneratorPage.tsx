import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useParams } from 'react-router-dom';

import BaseForm from '../../components/common/BaseForm';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/ui/button.css';
import apiClient from '../../components/utils/apiClient';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';

import DynamicFormFieldRenderer from './components/DynamicFormFieldRenderer';
import { type GeneratorConfig, DEFAULT_FEATURE_TOGGLES } from './types/generatorTypes';

import type { HelpContent, BaseFormProps } from '../../types/baseform';

const CustomGeneratorPage: React.FC = memo(() => {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const [generatorConfig, setGeneratorConfig] = useState<GeneratorConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  // URL crawler hook for automatic link processing
  const { crawledUrls, isCrawling, detectAndCrawlUrls } = useUrlCrawler();

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
      form.generator?.handleGeneratedContentChange('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isAuthenticated, user?.id, authLoading]);

  const isCrawlingRef = useRef(isCrawling);
  isCrawlingRef.current = isCrawling;

  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (!isCrawlingRef.current && urls.length > 0 && form.generator) {
        await detectAndCrawlUrls(urls.join(' '), form.generator.toggles.privacyMode);
      }
    },
    [detectAndCrawlUrls, form.generator]
  );

  // Custom submission handler for dynamic generator configuration (streaming via SSE)
  const customSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!form.generator) return;

      try {
        const cleanFormData: Record<string, unknown> = {};
        if (generatorConfig) {
          generatorConfig.form_schema.fields.forEach((field) => {
            cleanFormData[field.name] = formData[field.name] || '';
          });
        }

        const allAttachments = [...form.generator.attachedFiles, ...crawledUrls];

        const payload: Record<string, unknown> = {
          slug,
          formData: cleanFormData,
          useWebSearchTool: form.generator.toggles.webSearch,
          usePrivacyMode: form.generator.toggles.privacyMode,
          useBedrock: form.generator.toggles.proMode,
          attachments: allAttachments,
        };

        const response = await form.generator.submitForm(payload);

        if (response) {
          const content =
            typeof response === 'string' ? response : (response as Record<string, unknown>).content;
          if (content) {
            form.generator.handleGeneratedContentChange(String(content));
            setTimeout(form.generator.resetSuccess, 3000);
          }
        }
      } catch (err) {
        console.error('Fehler bei der Generierung:', err);
        if (err instanceof Error) {
          form.handleSubmitError(err);
        } else {
          form.handleSubmitError(new Error(String(err)));
        }
      }
    },
    [form.generator, generatorConfig, slug, crawledUrls]
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
  }, [form.handleSubmit, customSubmit]);

  const baseFormProps = useMemo<BaseFormProps>(
    () => ({
      ...((form.generator?.baseFormProps as unknown as BaseFormProps) || {}),
      title: generatorConfig?.name || generatorConfig?.title || '',
      onSubmit: handleFormSubmit,
      submitButtonProps,
      showProfileSelector: false,
      firstExtrasChildren: saveButton,
    }),
    [
      form.generator?.baseFormProps,
      generatorConfig?.name,
      generatorConfig?.title,
      handleFormSubmit,
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
      <div className="flex flex-col items-center justify-start container with-header">
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
