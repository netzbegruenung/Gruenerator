import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOptimizedAuth } from '../../hooks/useAuth';
import type { HelpContent, BaseFormProps } from '../../types/baseform';
import BaseForm from '../../components/common/BaseForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';
import '../../assets/styles/components/ui/button.css';
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import { GeneratorConfig, DEFAULT_FEATURE_TOGGLES } from './types/generatorTypes';
import DynamicFormFieldRenderer from './components/DynamicFormFieldRenderer';

interface CustomGeneratorPageProps {
  showHeaderFooter?: boolean;
}

const CustomGeneratorPage: React.FC<CustomGeneratorPageProps> = ({ showHeaderFooter = true }) => {
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
  const {
    crawledUrls,
    isCrawling,
    detectAndCrawlUrls,
    retryUrl
  } = useUrlCrawler();

  // API submission hook for loading state management
  const { submitForm, loading: isSubmitting, success: submissionSuccess, resetSuccess, error: submissionError } = useApiSubmit('/custom_generator');

  // Create default values for the form
  const defaultValues: Record<string, unknown> = { ...DEFAULT_FEATURE_TOGGLES };
  if (generatorConfig) {
    generatorConfig.form_schema.fields.forEach(field => {
      defaultValues[field.name] = field.defaultValue || '';
    });
  }

  const helpContent: HelpContent = {
    content: generatorConfig?.description || "Benutzerdefinierter Grünerator",
    tips: [
      "Fülle alle erforderlichen Felder aus"
    ]
  };

  const form = useBaseForm({
    defaultValues,
    generatorType: 'custom-generator',
    componentName: 'customGenerator',
    endpoint: '/custom_generator',
    instructionType: 'custom_generator',
    tabIndexKey: 'CUSTOM_GENERATOR',
    helpContent,
    useFeatureIcons: false,
    disableKnowledgeSystem: true
  } as unknown as Parameters<typeof useBaseForm>[0]);

  // Reset form when generator config changes
  useEffect(() => {
    if (generatorConfig) {
      const newDefaults: Record<string, unknown> = { ...DEFAULT_FEATURE_TOGGLES };
      generatorConfig.form_schema.fields.forEach(field => {
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
      fetchGeneratorConfig();
    }
  }, [slug, isAuthenticated, user?.id, authLoading]);

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    if (!isCrawling && urls.length > 0 && form.generator) {
      const { toggles } = form.generator as unknown as { toggles: { privacyMode: boolean } };
      await detectAndCrawlUrls(urls.join(' '), toggles.privacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, form.generator]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url: string) => {
    if (form.generator) {
      const { toggles } = form.generator as unknown as { toggles: { privacyMode: boolean } };
      await retryUrl(url, toggles.privacyMode);
    }
  }, [retryUrl, form.generator]);

  // Custom submission handler for dynamic generator configuration
  const customSubmit = useCallback(async (formData: Record<string, unknown>) => {
    try {
      // Create clean form data object - only include fields from generator config
      const cleanFormData: Record<string, unknown> = {};
      if (generatorConfig) {
        generatorConfig.form_schema.fields.forEach(field => {
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
          toggles: { webSearch: boolean; privacyMode: boolean; proMode: boolean }
        };
        cleanFormData.useWebSearchTool = toggles.webSearch;
        cleanFormData.usePrivacyMode = toggles.privacyMode;
        cleanFormData.useBedrock = toggles.proMode;  // Pro mode flag for backend API
      }
      cleanFormData.attachments = allAttachments;

      // Use submitForm instead of apiClient.post for automatic loading state management
      const response = await submitForm({
        slug,
        formData: cleanFormData
      });

      const content = (response as { content?: string; data?: { content?: string } })?.content ||
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
  }, [submitForm, resetSuccess, generatorConfig, form, slug, crawledUrls]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setLocalGeneratedContent(content);
    if (form.generator) {
      form.generator.handleGeneratedContentChange(content);
    }
  }, [form.generator]);

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

  if (loading) return <div>Lade...</div>;
  if (error) return <div>Fehler: {error}</div>;
  if (!generatorConfig) return <div>Generator nicht gefunden</div>;

  // Build owner display name
  const ownerName = generatorConfig.owner_first_name
    ? `${generatorConfig.owner_first_name} ${generatorConfig.owner_last_name || ''}`.trim()
    : generatorConfig.owner_email || 'Unbekannt';

  // Save button component for non-owners
  const saveButton = !isOwner && (
    <button
      type="button"
      className={`btn-primary size-s ${isSaved ? 'saved' : ''}`}
      onClick={handleSaveGenerator}
      disabled={isSaving || isSaved}
      title={isSaved ? 'Bereits gespeichert' : 'In meinem Profil speichern'}
      style={isSaved ? { backgroundColor: 'var(--klee)', cursor: 'default' } : {}}
    >
      {isSaving ? 'Speichern...' : isSaved ? 'Gespeichert ✓' : 'Speichern'}
    </button>
  );


  const baseFormProps: BaseFormProps = {
    ...(form.generator?.baseFormProps as unknown as BaseFormProps || {}),
    title: generatorConfig.name || generatorConfig.title,
    onSubmit: () => form.handleSubmit(customSubmit)(),
    loading: isSubmitting,
    success: submissionSuccess,
    error: submissionError,
    generatedContent: localGeneratedContent,
    onGeneratedContentChange: handleGeneratedContentChange,
    submitButtonProps: {
      defaultText: 'Grünerieren'
    },
    showProfileSelector: false,
    firstExtrasChildren: saveButton
  };

  return (
    <ErrorBoundary>
      <div className={`custom-generator-page-container container ${showHeaderFooter ? 'with-header' : ''}`}>
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
};

export default CustomGeneratorPage;
