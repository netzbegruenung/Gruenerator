import React, { useState, useEffect } from 'react';
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
  const defaultValues = {};
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
    formState: { errors }
  } = useForm({
    defaultValues
  });

  // Reset form when generator config changes
  useEffect(() => {
    if (generatorConfig) {
      const newDefaults = {};
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

  const onSubmitRHF = async (rhfData) => {
    try {
      // Create clean form data object - only include fields from generator config
      const formDataToSubmit = {};
      if (generatorConfig) {
        generatorConfig.form_schema.fields.forEach(field => {
          formDataToSubmit[field.name] = rhfData[field.name] || '';
        });
      }

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
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage; 