import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { Controller } from 'react-hook-form';
import BaseForm from '../../components/common/BaseForm';
import FormInput from '../../components/common/Form/Input/FormInput';
import FormTextarea from '../../components/common/Form/Input/FormTextarea';
import EnhancedSelect from '../../components/common/EnhancedSelect';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';
import '../../assets/styles/components/ui/button.css';
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import useApiSubmit from '../../components/hooks/useApiSubmit';

interface CustomGeneratorPageProps {
  showHeaderFooter?: boolean;
}

interface FormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
}

interface GeneratorConfig {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  slug: string;
  is_owner?: boolean;
  is_saved?: boolean;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
  form_schema: {
    fields: FormField[];
  };
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
  const defaultValues = {
    useWebSearchTool: false,
    usePrivacyMode: false,
    useBedrock: false
  };
  if (generatorConfig) {
    generatorConfig.form_schema.fields.forEach(field => {
      defaultValues[field.name] = field.defaultValue || '';
    });
  }

  const helpContent = {
    content: generatorConfig?.description || "Benutzerdefinierter Grünerator",
    title: generatorConfig?.name || generatorConfig?.title || "Custom Generator",
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
    helpContent: helpContent,
    useFeatureIcons: false,
    disableKnowledgeSystem: true
  });

  // Reset form when generator config changes
  useEffect(() => {
    if (generatorConfig) {
      const newDefaults = {
        useWebSearchTool: false,
        usePrivacyMode: false,
        useBedrock: false
      };
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
        if (err.response?.status === 404) {
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
  const handleUrlsDetected = useCallback(async (urls) => {
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), form.generator.toggles.privacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, form.generator.toggles.privacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
    await retryUrl(url, form.generator.toggles.privacyMode);
  }, [retryUrl, form.generator.toggles.privacyMode]);

  // Custom submission handler for dynamic generator configuration
  const customSubmit = useCallback(async (formData) => {
    try {
      // Create clean form data object - only include fields from generator config
      const cleanFormData = {};
      if (generatorConfig) {
        generatorConfig.form_schema.fields.forEach(field => {
          cleanFormData[field.name] = formData[field.name] || '';
        });
      }

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...form.generator.attachedFiles,
        ...crawledUrls
      ];

      // Add feature flags and attachments to form data
      cleanFormData.useWebSearchTool = form.generator.toggles.webSearch;
      cleanFormData.usePrivacyMode = form.generator.toggles.privacyMode;
      cleanFormData.useBedrock = form.generator.toggles.proMode;  // Pro mode flag for backend API
      cleanFormData.attachments = allAttachments;

      // Use submitForm instead of apiClient.post for automatic loading state management
      const response = await submitForm({
        slug,
        formData: cleanFormData
      });

      const content = response?.content || response?.data?.content || response?.data || response;

      if (content) {
        setLocalGeneratedContent(content);
        form.generator.handleGeneratedContentChange(content);
        setTimeout(resetSuccess, 3000);
      } else {
        setLocalGeneratedContent('');
      }
    } catch (err) {
      console.error('Fehler bei der Generierung:', err);
      setLocalGeneratedContent('');
    }
  }, [submitForm, resetSuccess, generatorConfig, form, slug, crawledUrls]);

  const handleGeneratedContentChange = useCallback((content) => {
    setLocalGeneratedContent(content);
    form.generator.handleGeneratedContentChange(content);
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

  const renderFormInputs = () => (
    <>
      {generatorConfig.form_schema.fields.map((field) => {
        if (field.type === 'textarea') {
          return (
            <FormTextarea
              key={field.name}
              name={field.name}
              label={field.label}
              placeholder={field.placeholder}
              required={field.required}
              control={form.control}
              defaultValue={field.defaultValue || ''}
              rows={4}
              rules={field.required ? { required: `${field.label} ist ein Pflichtfeld` } : {}}
              enableUrlDetection={true}
              onUrlsDetected={handleUrlsDetected}
            />
          );
        }

        if (field.type === 'select') {
          const selectOptions = (field.options || []).map(option => ({
            value: option.value,
            label: option.label
          }));

          return (
            <Controller
              key={field.name}
              name={field.name}
              control={form.control}
              defaultValue={field.defaultValue || ''}
              rules={field.required ? { required: `${field.label} ist ein Pflichtfeld` } : {}}
              render={({ field: controllerField, fieldState }) => (
                <EnhancedSelect
                  inputId={`${field.name}-select`}
                  label={field.label}
                  options={selectOptions}
                  placeholder={field.placeholder || 'Bitte wählen...'}
                  value={controllerField.value ? selectOptions.find(opt => opt.value === controllerField.value) : null}
                  onChange={(selectedOption) => {
                    const value = selectedOption ? selectedOption.value : null;
                    controllerField.onChange(value);
                  }}
                  onBlur={controllerField.onBlur}
                  isClearable={!field.required}
                  isSearchable={false}
                  className="react-select"
                  classNamePrefix="react-select"
                  error={fieldState.error?.message}
                  required={field.required}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                />
              )}
            />
          );
        }

        return (
          <FormInput
            key={field.name}
            name={field.name}
            label={field.label}
            placeholder={field.placeholder}
            type={field.type}
            required={field.required}
            control={form.control}
            defaultValue={field.defaultValue || ''}
            rules={field.required ? { required: `${field.label} ist ein Pflichtfeld` } : {}}
          />
        );
      })}
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`custom-generator-page-container container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator.baseFormProps}
          title={generatorConfig.name || generatorConfig.title}
          onSubmit={form.handleSubmit(customSubmit)}
          loading={isSubmitting}
          success={submissionSuccess}
          error={submissionError}
          generatedContent={localGeneratedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          submitButtonProps={{
            defaultText: 'Grünerieren'
          }}
          showProfileSelector={false}
          firstExtrasChildren={saveButton}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage;
