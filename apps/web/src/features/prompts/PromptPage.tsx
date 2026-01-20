import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOptimizedAuth } from '../../hooks/useAuth';
import BaseForm from '../../components/common/BaseForm';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import { useGeneratorSetup } from '../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../hooks/useFormDataBuilder';
import apiClient from '../../components/utils/apiClient';
import PromptInputForm from './PromptInputForm';
import type { CustomPrompt } from './types';
import './prompts.css';

interface FormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface PromptPageProps {
  showHeaderFooter?: boolean;
}

interface PromptResponse {
  success: boolean;
  prompt?: CustomPrompt & {
    is_owner: boolean;
    is_saved: boolean;
  };
  message?: string;
}

const COMPONENT_NAME = 'prompt-executor';

const PromptPage: React.FC<PromptPageProps> = memo(({ showHeaderFooter = true }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const formRef = useRef<FormRef>(null);

  const [promptData, setPromptData] = useState<CustomPrompt | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setup = useGeneratorSetup({
    instructionType: 'universal',
    componentName: COMPONENT_NAME
  });

  const form = useBaseForm({
    defaultValues: { userInput: '' },
    generatorType: 'prompt-executor',
    componentName: COMPONENT_NAME,
    endpoint: '/custom_prompt',
    disableKnowledgeSystem: false,
    features: ['webSearch', 'privacyMode', 'proMode'],
    useFeatureIcons: true,
    tabIndexKey: 'PROMPTS',
    defaultMode: 'balanced'
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const allAttachments = useMemo(() =>
    form.generator?.attachedFiles || [],
    [form.generator?.attachedFiles]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['userInput'] as const
  });

  useEffect(() => {
    const fetchPrompt = async () => {
      if (!slug) return;

      if (!isAuthenticated || !user?.id) {
        setFetchError('Authentifizierung erforderlich');
        setFetchLoading(false);
        return;
      }

      setFetchLoading(true);
      setFetchError(null);

      try {
        const response = await apiClient.get<PromptResponse>(`/custom_prompt/${slug}`);

        if (response.data?.success && response.data.prompt) {
          setPromptData(response.data.prompt);
          setIsOwner(response.data.prompt.is_owner || false);
          setIsSaved(response.data.prompt.is_saved || false);
        } else {
          setFetchError(response.data?.message || 'Prompt nicht gefunden');
        }
      } catch (err) {
        const error = err as Error;
        setFetchError(error.message || 'Fehler beim Laden des Prompts');
      } finally {
        setFetchLoading(false);
      }
    };

    if (!authLoading) {
      fetchPrompt();
    }
  }, [slug, isAuthenticated, user?.id, authLoading]);

  const handleSubmit = useCallback(async () => {
    if (!promptData || !formRef.current?.getFormData) return;

    const formData = formRef.current.getFormData();
    const userInput = formData.userInput as string;

    if (!userInput?.trim()) return;

    setIsSubmitting(true);

    try {
      const formDataToSubmit = builder.buildSubmissionData({
        ...formData,
        promptId: promptData.id,
        slug: promptData.slug,
        userInput: userInput.trim(),
        prompt: promptData.prompt
      });

      const response = await apiClient.post('/custom_prompt', formDataToSubmit);

      const responseData = response.data || response;
      const content = typeof responseData === 'string'
        ? responseData
        : responseData.generated_text || responseData.content;

      if (content && form.generator) {
        form.generator.handleGeneratedContentChange(content);
      }
    } catch (err) {
      const error = err as Error;
      form.handleSubmitError(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [promptData, form, builder]);

  const handleSave = useCallback(async () => {
    if (!promptData) return;

    setIsSaving(true);
    try {
      await apiClient.post(`/auth/saved_prompts/${promptData.id}`);
      setIsSaved(true);
    } catch (err) {
      const error = err as Error;
      form.handleSubmitError(error);
    } finally {
      setIsSaving(false);
    }
  }, [promptData, form]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const inputHeaderContent = useMemo(() => {
    if (isOwner || (!promptData?.owner_first_name && isSaved)) return null;

    return (
      <div className="prompt-page__header-info">
        {!isOwner && promptData?.owner_first_name && (
          <span className="prompt-page__owner">
            Erstellt von {promptData.owner_first_name} {promptData.owner_last_name || ''}
          </span>
        )}
        {!isOwner && !isSaved && (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Speichert...' : 'Prompt speichern'}
          </button>
        )}
        {isSaved && !isOwner && (
          <span className="prompt-page__saved-badge">✓ Gespeichert</span>
        )}
      </div>
    );
  }, [isOwner, isSaved, promptData, handleSave, isSaving]);

  if (authLoading || fetchLoading) {
    return (
      <div className="prompt-page-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (fetchError && !promptData) {
    return (
      <div className="prompt-page-error">
        <div className="prompt-page-error-content">
          <h3>Fehler</h3>
          <p>{fetchError}</p>
          <button type="button" className="btn-primary" onClick={handleBack}>
            Zurück
          </button>
        </div>
      </div>
    );
  }

  if (!promptData) {
    return null;
  }

  const baseFormProps = form.generator?.baseFormProps || {};
  const {
    platformOptions: _platformOptions,
    componentName: _componentName,
    ...restBaseFormProps
  } = baseFormProps;

  const rawTabIndex = form.generator?.tabIndex;
  const tabIndexValue = (rawTabIndex || {}) as { formType?: number; hauptfeld?: number; [key: string]: number | undefined };

  return (
    <div className="prompt-page">
      {form.generator && (
        <BaseForm
          {...restBaseFormProps}
          componentName={COMPONENT_NAME}
          title={promptData.name}
          startPageDescription={promptData.description}
          useStartPageLayout={true}
          enableEditMode={true}
          onSubmit={handleSubmit}
          loading={isSubmitting}
          inputHeaderContent={inputHeaderContent}
        >
          <PromptInputForm ref={formRef} tabIndex={tabIndexValue} />
        </BaseForm>
      )}
    </div>
  );
});

PromptPage.displayName = 'PromptPage';

export default PromptPage;
