import React, { useState, useCallback, useMemo } from 'react';
import {
  PiMagicWand,
  PiArrowsClockwise,
  PiTextAlignLeft,
  PiCheckCircle,
  PiBriefcase,
  PiTextAa,
} from 'react-icons/pi';

import BaseForm from '../../components/common/BaseForm';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import { FormTextarea } from '../../components/common/Form/Input';
import PlatformSelector from '../../components/common/PlatformSelector';
import ErrorBoundary from '../../components/ErrorBoundary';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import { useUserInstructions } from '../../hooks/useUserInstructions';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';

import type { BaseFormProps, HelpContent, PlatformOption } from '@/types/baseform';
import type { Control, FieldValues } from 'react-hook-form';

interface TextImproverFormValues {
  originalText: string;
  action: string[];
}

interface ActionOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface UseBaseFormReturn {
  control: Control<FieldValues>;
  handleSubmit: <T>(handler: (data: T) => Promise<void>) => () => Promise<void>;
  generator?: {
    attachedFiles?: Array<{ name: string; content: string }>;
    tabIndex?: Record<string, number>;
    baseFormTabIndex?: { platformSelectorTabIndex?: number };
    baseFormProps?: Partial<BaseFormProps>;
  };
}

interface ApiResponse {
  content?: string;
  metadata?: Record<string, unknown>;
}

interface AITextImproverGeneratorProps {
  showHeaderFooter?: boolean;
}

const AITextImproverGenerator: React.FC<AITextImproverGeneratorProps> = ({
  showHeaderFooter = true,
}) => {
  const componentName = 'text-improver';
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const actionOptions: ActionOption[] = useMemo(
    () => [
      { id: 'improve', label: 'Verbessern', icon: <PiMagicWand size={16} /> },
      { id: 'rewrite', label: 'Umschreiben', icon: <PiArrowsClockwise size={16} /> },
      { id: 'summarize', label: 'Zusammenfassen', icon: <PiTextAlignLeft size={16} /> },
      { id: 'spellcheck', label: 'Rechtschreibung korrigieren', icon: <PiCheckCircle size={16} /> },
      { id: 'formalize', label: 'Formell machen', icon: <PiBriefcase size={16} /> },
      { id: 'simplify', label: 'Vereinfachen', icon: <PiTextAa size={16} /> },
    ],
    []
  );

  const getFeatureState = useGeneratorSelectionStore((state) => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore((state) => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore((state) => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore((state) => state.isInstructionsActive);
  const usePrivacyMode = useGeneratorSelectionStore((state) => state.usePrivacyMode);

  const customPrompt = useUserInstructions('text_improver', isInstructionsActive);

  const helpContentConfig: HelpContent = {
    content:
      'Dieser Grünerator hilft dir, bestehende Texte zu verbessern, umzuschreiben oder zu transformieren.',
    tips: [
      'Füge deinen Text ein',
      'Wähle eine Aktion: Verbessern, Umschreiben, Zusammenfassen, etc.',
      'Der KI-Assistent bearbeitet deinen Text entsprechend der gewählten Aktion',
    ],
  };

  const baseFormConfig = {
    defaultValues: {
      originalText: '',
      action: ['improve'],
    },
    generatorType: 'text-improver',
    componentName: componentName,
    endpoint: '/claude_text_improver',
    instructionType: 'text_improver',
    features: ['privacyMode'],
    tabIndexKey: 'TEXT_IMPROVER',
    helpContent: helpContentConfig,
  };

  const form = useBaseForm(
    baseFormConfig as unknown as Parameters<typeof useBaseForm>[0]
  ) as UseBaseFormReturn;

  const { control, handleSubmit } = form;

  const [improvedContent, setImprovedContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } =
    useApiSubmit('/claude_text_improver');
  const storeGeneratedText = useGeneratedTextStore((state) =>
    state.getGeneratedText(componentName)
  );

  const { crawledUrls, detectAndCrawlUrls, isCrawling } = useUrlCrawler();

  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (!isCrawling && urls.length > 0) {
        await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
      }
    },
    [detectAndCrawlUrls, isCrawling, usePrivacyMode]
  );

  const onSubmitRHF = useCallback(
    async (rhfData: TextImproverFormValues) => {
      setStoreIsLoading(true);

      try {
        const features = getFeatureState();
        const selectedAction = Array.isArray(rhfData.action) ? rhfData.action[0] : rhfData.action;

        const allAttachments = [...(form.generator?.attachedFiles || []), ...crawledUrls];

        const formDataToSubmit = {
          originalText: rhfData.originalText,
          action: selectedAction,
          ...features,
          attachments: allAttachments,
          customPrompt: customPrompt,
          selectedDocumentIds: selectedDocumentIds || [],
          selectedTextIds: selectedTextIds || [],
          searchQuery: rhfData.originalText?.substring(0, 200) || '',
        };

        const response = (await submitForm(formDataToSubmit)) as string | ApiResponse | null;

        if (response) {
          const content = typeof response === 'string' ? response : response.content;
          const metadata =
            typeof response === 'object' && response !== null ? response.metadata || {} : {};

          if (content) {
            setImprovedContent(content);
            setGeneratedText(componentName, content, metadata);
            setTimeout(resetSuccess, 3000);
          }
        }
      } catch (submitError) {
        console.error('[AITextImproverGenerator] Error submitting form:', submitError);
      } finally {
        setStoreIsLoading(false);
      }
    },
    [
      submitForm,
      resetSuccess,
      setGeneratedText,
      setStoreIsLoading,
      customPrompt,
      form.generator,
      crawledUrls,
      selectedDocumentIds,
      selectedTextIds,
      getFeatureState,
    ]
  );

  const handleGeneratedContentChange = useCallback(
    (content: string) => {
      setImprovedContent(content);
      setGeneratedText(componentName, content);
    },
    [setGeneratedText, componentName]
  );

  const platformOptionsForSelector: PlatformOption[] = actionOptions.map((opt) => ({
    id: opt.id,
    label: opt.label,
  }));

  const renderActionSelector = () => (
    <PlatformSelector
      name="action"
      control={control}
      platformOptions={platformOptionsForSelector}
      label=""
      placeholder="Aktion auswählen..."
      required={true}
      isMulti={false}
      tabIndex={form.generator?.baseFormTabIndex?.platformSelectorTabIndex}
    />
  );

  const renderFormInputs = () => (
    <FormTextarea
      name="originalText"
      control={control}
      placeholder="Füge hier den Text ein, den du bearbeiten möchtest..."
      rules={{ required: 'Text ist ein Pflichtfeld' }}
      minRows={8}
      maxRows={50}
      className="form-textarea-large"
      tabIndex={form.generator?.tabIndex?.originalText}
      enableUrlDetection={true}
      onUrlsDetected={handleUrlsDetected}
    />
  );

  const baseFormProps = form.generator?.baseFormProps || {};
  const generatedContentValue =
    typeof storeGeneratedText === 'string'
      ? storeGeneratedText
      : storeGeneratedText
        ? String(storeGeneratedText)
        : improvedContent;

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...baseFormProps}
          title="Was möchtest du heute grünerieren?"
          subtitle="Verbessere und optimiere deine Texte"
          onSubmit={() => handleSubmit<TextImproverFormValues>(onSubmitRHF)()}
          loading={loading}
          success={success}
          error={error}
          generatedContent={generatedContentValue}
          onGeneratedContentChange={handleGeneratedContentChange}
          enableEditMode={true}
          componentName={componentName}
          firstExtrasChildren={renderActionSelector()}
          helpContent={helpContentConfig}
          platformOptions={platformOptionsForSelector}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default AITextImproverGenerator;
