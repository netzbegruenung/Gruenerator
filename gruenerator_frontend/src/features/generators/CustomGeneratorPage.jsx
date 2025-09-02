import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useForm } from 'react-hook-form';
import BaseForm from '../../components/common/BaseForm';
import FormInput from '../../components/common/Form/Input/FormInput';
import FormTextarea from '../../components/common/Form/Input/FormTextarea';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../components/hooks/useKnowledge';
import { createKnowledgePrompt } from '../../utils/knowledgeFormUtils';
import { prepareFilesForSubmission } from '../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';

const CustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const { slug } = useParams();
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const [generatorConfig, setGeneratorConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { submitForm, loading: submitLoading, success, resetSuccess, error: submitError } = useApiSubmit('/custom_generator');
  const [localGeneratedContent, setLocalGeneratedContent] = useState('');
  
  // Use generatedTextStore instead of FormContext
  const { setGeneratedText } = useGeneratedTextStore();

  // File attachment and feature states
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

  // Initialize knowledge system with UI configuration
  useKnowledge({ 
    instructionType: 'custom_generator', 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Store integration - all knowledge and instructions from store
  const {
    source,
    isInstructionsActive,
    getKnowledgeContent,
    getDocumentContent,
    getActiveInstruction
  } = useGeneratorKnowledgeStore();

  // Create default values for react-hook-form
  const defaultValues = {
    useWebSearchTool: false,
    usePrivacyMode: false
  };
  if (generatorConfig) {
    generatorConfig.form_schema.fields.forEach(field => {
      defaultValues[field.name] = field.defaultValue || '';
    });
  }

  // Setup react-hook-form
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues
  });

  // Watch feature toggle values
  const watchUseWebSearch = watch('useWebSearchTool');
  const watchUsePrivacyMode = watch('usePrivacyMode');

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
      reset(newDefaults);
    }
  }, [generatorConfig, reset]);


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
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), watchUsePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, watchUsePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url) => {
    await retryUrl(url, watchUsePrivacyMode);
  }, [retryUrl, watchUsePrivacyMode]);

  // Handle file attachment
  const handleAttachmentClick = useCallback(async (files) => {
    try {
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error('[CustomGeneratorPage] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  // Handle file removal
  const handleRemoveFile = useCallback((index) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const onSubmitRHF = async (rhfData) => {
    try {
      // Create clean form data object - only include fields from generator config
      const formDataToSubmit = {};
      if (generatorConfig) {
        generatorConfig.form_schema.fields.forEach(field => {
          formDataToSubmit[field.name] = rhfData[field.name] || '';
        });
      }

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...processedAttachments,
        ...crawledUrls
      ];

      // Add feature flags and attachments to form data
      formDataToSubmit.useWebSearchTool = rhfData.useWebSearchTool;
      formDataToSubmit.usePrivacyMode = rhfData.usePrivacyMode;
      formDataToSubmit.attachments = allAttachments;

      // Add knowledge content to the submission
      const knowledgePrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'custom_generator',
        groupDetailsData: null, // Custom generators don't use group data
        getKnowledgeContent,
        getDocumentContent,
        memoryOptions: {
          enableMemories: false,
          query: null
        }
      });

      const response = await submitForm({
        slug,
        formData: formDataToSubmit,
        knowledgeContent: knowledgePrompt
      });
      
      const content = response?.content || (typeof response === 'string' ? response : '');
      
      if (content) {
        setLocalGeneratedContent(content);
        setGeneratedText('customGenerator', content);
        setTimeout(resetSuccess, 3000);
      } else {
        setLocalGeneratedContent('');
        setGeneratedText('customGenerator', '');
      }
    } catch (err) {
      console.error('Fehler bei der Generierung:', err);
      setLocalGeneratedContent('');
      setGeneratedText('customGenerator', '');
    }
  };

  // Feature toggle configurations  
  const webSearchFeatureToggle = {
    isActive: watchUseWebSearch,
    onToggle: (checked) => {
      setValue('useWebSearchTool', checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "",
    tabIndex: 11
  };

  const privacyModeToggle = {
    isActive: watchUsePrivacyMode,
    onToggle: (checked) => {
      setValue('usePrivacyMode', checked);
    },
    label: "Privacy-Mode",
    icon: HiShieldCheck,
    description: "Verwendet deutsche Server der Netzbegrünung.",
    tabIndex: 13
  };

  const handleReset = () => {
    setLocalGeneratedContent('');
    setGeneratedText('customGenerator', '');
    resetSuccess();
  };

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
              control={control}
              defaultValue={field.defaultValue || ''}
              rows={4}
              rules={field.required ? { required: `${field.label} ist ein Pflichtfeld` } : {}}
              enableUrlDetection={true}
              onUrlsDetected={handleUrlsDetected}
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
            control={control}
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
          title={generatorConfig.name || generatorConfig.title}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={submitLoading}
          success={success}
          error={submitError?.message}
          generatedContent={localGeneratedContent}
          submitButtonProps={{
            defaultText: 'Grünerieren'
          }}
          formNotice={
            generatorConfig.description && (
              <p className="generator-description">{generatorConfig.description}</p>
            )
          }
          showProfileSelector={false}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={true}
          privacyModeToggle={privacyModeToggle}
          usePrivacyModeToggle={true}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage; 