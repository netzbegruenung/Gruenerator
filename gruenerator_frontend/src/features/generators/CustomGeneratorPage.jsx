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
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';

const CustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const { slug } = useParams();
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const [generatorConfig, setGeneratorConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localGeneratedContent, setLocalGeneratedContent] = useState('');

  const { setGeneratedText } = useGeneratedTextStore();

  // URL crawler hook for automatic link processing
  const {
    crawledUrls,
    isCrawling,
    detectAndCrawlUrls,
    retryUrl
  } = useUrlCrawler();

  // Create default values for the form
  const defaultValues = {
    useWebSearchTool: false,
    usePrivacyMode: false
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
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'CUSTOM_GENERATOR',
    helpContent: helpContent
  });

  // Reset form when generator config changes
  useEffect(() => {
    if (generatorConfig) {
      const newDefaults = {
        useWebSearchTool: false,
        usePrivacyMode: false
      };
      generatorConfig.form_schema.fields.forEach(field => {
        newDefaults[field.name] = field.defaultValue || '';
      });
      form.reset(newDefaults);
    }
  }, [generatorConfig, form]);


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
      cleanFormData.useWebSearchTool = formData.useWebSearchTool;
      cleanFormData.usePrivacyMode = formData.usePrivacyMode;
      cleanFormData.attachments = allAttachments;

      // Submit with custom payload structure
      const { default: apiClient } = await import('../../components/utils/apiClient');
      const response = await apiClient.post('/custom_generator', {
        slug,
        formData: cleanFormData
      });

      const content = response?.data?.content || response?.data || response;

      if (content) {
        setLocalGeneratedContent(content);
        form.generator.handleGeneratedContentChange(content);
      } else {
        setLocalGeneratedContent('');
      }
    } catch (err) {
      console.error('Fehler bei der Generierung:', err);
      form.handleSubmitError(err);
      setLocalGeneratedContent('');
    }
  }, [generatorConfig, form, slug, crawledUrls]);

  const handleGeneratedContentChange = useCallback((content) => {
    setLocalGeneratedContent(content);
    form.generator.handleGeneratedContentChange(content);
  }, [form.generator]);

  if (loading) return <div>Lade...</div>;
  if (error) return <div>Fehler: {error}</div>;
  if (!generatorConfig) return <div>Generator nicht gefunden</div>;

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
                  {...controllerField}
                  inputId={`${field.name}-select`}
                  label={field.label}
                  options={selectOptions}
                  placeholder={field.placeholder || 'Bitte wählen...'}
                  isClearable={!field.required}
                  isSearchable={false}
                  className="custom-generator-select"
                  classNamePrefix="custom-generator-select"
                  error={fieldState.error?.message}
                  required={field.required}
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
          generatedContent={localGeneratedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          submitButtonProps={{
            defaultText: 'Grünerieren'
          }}
          formNotice={
            generatorConfig.description && (
              <p className="generator-description">{generatorConfig.description}</p>
            )
          }
          showProfileSelector={false}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage; 