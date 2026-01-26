import React, { useState, useCallback, useMemo, useRef, memo } from 'react';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import TexteForm from '../texte/TexteForm';

import type { ExamplePrompt } from '@/types/baseform';
import './TexteTab.css';

interface FormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface TexteTabProps {
  isActive: boolean;
}

const COMPONENT_NAME = 'texte-generator';

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: 'Social Post', text: 'Erstelle einen Social Media Post über ' },
  { label: 'E-Mail', text: 'Schreibe eine professionelle E-Mail zu ' },
  { label: 'Zusammenfassung', text: 'Fasse folgenden Text zusammen: ' },
];

const TexteTab: React.FC<TexteTabProps> = memo(({ isActive }) => {
  const [isLoading, setIsLoading] = useState(false);
  const texteFormRef = useRef<FormRef>(null);

  const setup = useGeneratorSetup({
    instructionType: 'universal',
    componentName: COMPONENT_NAME,
  });

  const helpContent = useMemo(
    () => ({
      content:
        'Erstelle beliebige Texte mit KI-Unterstützung - von Social Media Posts über E-Mails bis hin zu Zusammenfassungen.',
      title: 'Texte Grünerator',
      tips: [
        'Beschreibe einfach, welchen Text du brauchst',
        'Sei so spezifisch wie möglich für bessere Ergebnisse',
        'Du kannst auch Texte zur Verbesserung einfügen',
      ],
    }),
    []
  );

  const form = useBaseForm({
    defaultValues: { inhalt: '' },
    generatorType: 'texte-generator',
    componentName: COMPONENT_NAME,
    endpoint: '/texte/smart',
    disableKnowledgeSystem: false,
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'TEXTE',
    defaultMode: 'balanced',
    helpContent,
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const allAttachments = useMemo(
    () => form.generator?.attachedFiles || [],
    [form.generator?.attachedFiles]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt'] as const,
  });

  const handleSubmit = useCallback(async () => {
    if (!texteFormRef.current?.getFormData) {
      console.error('[TexteTab] Form ref not ready or getFormData not available');
      return;
    }

    const formData = texteFormRef.current.getFormData();

    if (!formData || !formData.inhalt) {
      console.error('[TexteTab] No form data returned or inhalt is empty');
      return;
    }

    setIsLoading(true);

    try {
      const formDataToSubmit = builder.buildSubmissionData(formData);

      const { default: apiClient } = await import('../../../components/utils/apiClient');
      const response = await apiClient.post('/texte/smart', formDataToSubmit);
      const responseData = response.data || response;

      const content = typeof responseData === 'string' ? responseData : responseData.content;

      if (content && form.generator) {
        form.generator.handleGeneratedContentChange(content);
      }
    } catch (error) {
      console.error('[TexteTab] Error submitting form:', error);
      if (error instanceof Error) {
        form.handleSubmitError(error);
      } else {
        form.handleSubmitError(new Error(String(error)));
      }
    } finally {
      setIsLoading(false);
    }
  }, [form, builder]);

  const handleExamplePromptClick = useCallback((prompt: ExamplePrompt) => {
    if (texteFormRef.current?.resetForm && prompt.text) {
      texteFormRef.current.resetForm({ inhalt: prompt.text });
    }
  }, []);

  const baseFormProps = form.generator?.baseFormProps;
  const {
    platformOptions: _platformOptions,
    componentName: _componentName,
    ...restBaseFormProps
  } = baseFormProps || {};

  const rawTabIndex = form.generator?.tabIndex;
  const tabIndexValue = (rawTabIndex || {}) as {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };

  return (
    <div className="texte-tab">
      {form.generator && (
        <BaseForm
          {...restBaseFormProps}
          componentName={COMPONENT_NAME}
          enableEditMode={true}
          onSubmit={handleSubmit}
          loading={isLoading}
          useStartPageLayout={true}
          examplePrompts={EXAMPLE_PROMPTS}
          onExamplePromptClick={handleExamplePromptClick}
        >
          <TexteForm ref={texteFormRef} tabIndex={tabIndexValue} />
        </BaseForm>
      )}
    </div>
  );
});

TexteTab.displayName = 'TexteTab';

export default TexteTab;
