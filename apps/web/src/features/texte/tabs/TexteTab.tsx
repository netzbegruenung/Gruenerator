import React, { useState, useCallback, useMemo, memo, FormEvent } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import PromptInput, { type PromptExample } from '../../../components/common/PromptInput/PromptInput';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import './TexteTab.css';

interface TexteTabProps {
  isActive: boolean;
}

const COMPONENT_NAME = 'texte-generator';

const EXAMPLE_PROMPTS: PromptExample[] = [
  { label: 'Social Post', text: 'Erstelle einen Social Media Post über ' },
  { label: 'E-Mail', text: 'Schreibe eine professionelle E-Mail zu ' },
  { label: 'Zusammenfassung', text: 'Fasse folgenden Text zusammen: ' },
  { label: 'Nachricht', text: 'Formuliere eine kurze Nachricht für ' },
];

const TexteTab: React.FC<TexteTabProps> = memo(({ isActive }) => {
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getGeneratedText, setGeneratedText } = useGeneratedTextStore();

  const setup = useGeneratorSetup({
    instructionType: 'universal',
    componentName: COMPONENT_NAME
  });

  const helpContent = useMemo(() => ({
    content: 'Erstelle beliebige Texte mit KI-Unterstützung - von Social Media Posts über E-Mails bis hin zu Zusammenfassungen.',
    title: 'Texte Grünerator',
    tips: [
      'Beschreibe einfach, welchen Text du brauchst',
      'Sei so spezifisch wie möglich für bessere Ergebnisse',
      'Du kannst auch Texte zur Verbesserung einfügen'
    ]
  }), []);

  const form = useBaseForm({
    defaultValues: { prompt: '' },
    generatorType: 'texte-generator',
    componentName: COMPONENT_NAME,
    endpoint: '/texte/smart',
    disableKnowledgeSystem: false,
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'TEXTE',
    defaultMode: 'balanced',
    helpContent
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const allAttachments = useMemo(() =>
    form.generator?.attachedFiles || [],
    [form.generator?.attachedFiles]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt'] as const
  });

  const handlePromptSubmit = useCallback(async (e?: FormEvent) => {
    if (e) e.preventDefault();

    const trimmedPrompt = promptInput.trim();
    if (!trimmedPrompt || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const formData = builder.buildSubmissionData({
        inhalt: trimmedPrompt
      });

      const { default: apiClient } = await import('../../../components/utils/apiClient');
      const response = await apiClient.post('/texte/smart', formData);
      const responseData = response.data || response;

      const content = typeof responseData === 'string' ? responseData : responseData.content;

      if (content && form.generator) {
        form.generator.handleGeneratedContentChange(content);
        setGeneratedText(COMPONENT_NAME, content, {});
      }
    } catch (err) {
      console.error('[TexteTab] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
      setError(errorMessage);
      form.handleSubmitError(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [promptInput, isLoading, builder, form, setGeneratedText]);

  const handleBaseFormSubmit = useCallback(async (data?: Record<string, unknown>) => {
    await handlePromptSubmit();
  }, [handlePromptSubmit]);

  const hasGeneratedContent = useMemo(() => {
    const content = getGeneratedText(COMPONENT_NAME);
    if (!content) return false;
    if (typeof content === 'string') return content.trim().length > 0;
    return Object.keys(content).length > 0;
  }, [getGeneratedText]);

  const baseFormProps = form.generator?.baseFormProps;
  const { platformOptions: _platformOptions, componentName: _componentName, ...restBaseFormProps } = baseFormProps || {};

  if (!isActive) return null;

  return (
    <div className="texte-tab">
      {!hasGeneratedContent ? (
        <div className="texte-tab-prompt-section">
          <PromptInput
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handlePromptSubmit}
            placeholder="Was möchtest du schreiben? Beschreibe deinen Text..."
            isLoading={isLoading}
            error={error}
            examples={EXAMPLE_PROMPTS}
            submitLabel="Text generieren"
          />
        </div>
      ) : (
        form.generator && (
          <BaseForm
            {...restBaseFormProps}
            componentName={COMPONENT_NAME}
            enableEditMode={true}
            onSubmit={handleBaseFormSubmit}
            loading={isLoading}
          />
        )
      )}
    </div>
  );
});

TexteTab.displayName = 'TexteTab';

export default TexteTab;
