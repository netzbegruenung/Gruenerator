import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  PiMagicWand,
  PiArrowsClockwise,
  PiTextAlignLeft,
  PiCheckCircle,
  PiBriefcase,
  PiTextAa,
} from 'react-icons/pi';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { FormTextarea } from '../../../components/common/Form/Input';
import PlatformSelector from '../../../components/common/PlatformSelector';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';

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

interface TextEditorTabProps {
  isActive: boolean;
}

// Memoized icon components to prevent recreation on every render
const ImproveIcon = memo(() => <PiMagicWand size={16} />);
ImproveIcon.displayName = 'ImproveIcon';

const RewriteIcon = memo(() => <PiArrowsClockwise size={16} />);
RewriteIcon.displayName = 'RewriteIcon';

const SummarizeIcon = memo(() => <PiTextAlignLeft size={16} />);
SummarizeIcon.displayName = 'SummarizeIcon';

const SpellcheckIcon = memo(() => <PiCheckCircle size={16} />);
SpellcheckIcon.displayName = 'SpellcheckIcon';

const FormalizeIcon = memo(() => <PiBriefcase size={16} />);
FormalizeIcon.displayName = 'FormalizeIcon';

const SimplifyIcon = memo(() => <PiTextAa size={16} />);
SimplifyIcon.displayName = 'SimplifyIcon';

// Static action options defined outside component to prevent recreation
const ACTION_OPTIONS: ActionOption[] = [
  { id: 'improve', label: 'Verbessern', icon: <ImproveIcon /> },
  { id: 'rewrite', label: 'Umschreiben', icon: <RewriteIcon /> },
  { id: 'summarize', label: 'Zusammenfassen', icon: <SummarizeIcon /> },
  { id: 'spellcheck', label: 'Rechtschreibung', icon: <SpellcheckIcon /> },
  { id: 'formalize', label: 'Formell machen', icon: <FormalizeIcon /> },
  { id: 'simplify', label: 'Vereinfachen', icon: <SimplifyIcon /> },
];

// Static help content defined outside component
const HELP_CONTENT_CONFIG: HelpContent = {
  content: 'Verbessere, schreibe um oder transformiere bestehende Texte.',
  tips: [
    'Füge deinen Text ein',
    'Wähle eine Aktion: Verbessern, Umschreiben, etc.',
    'Der KI-Assistent bearbeitet deinen Text',
  ],
};

// Static form config defined outside component
const BASE_FORM_CONFIG = {
  defaultValues: {
    originalText: '',
    action: ['improve'],
  },
  generatorType: 'text-improver',
  componentName: 'text-improver',
  endpoint: '/claude_text_improver',
  instructionType: 'text_improver',
  features: ['privacyMode'],
  tabIndexKey: 'TEXT_IMPROVER',
  helpContent: HELP_CONTENT_CONFIG,
};

const TextEditorTab: React.FC<TextEditorTabProps> = memo(({ isActive }) => {
  const componentName = 'text-improver';
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const getFeatureState = useGeneratorSelectionStore((state) => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore((state) => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore((state) => state.selectedTextIds);
  const usePrivacyMode = useGeneratorSelectionStore((state) => state.usePrivacyMode);

  const form = useBaseForm(
    BASE_FORM_CONFIG as unknown as Parameters<typeof useBaseForm>[0]
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
        console.error('[TextEditorTab] Error:', submitError);
      } finally {
        setStoreIsLoading(false);
      }
    },
    [
      submitForm,
      resetSuccess,
      setGeneratedText,
      setStoreIsLoading,
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

  const platformOptionsForSelector = useMemo<PlatformOption[]>(
    () =>
      ACTION_OPTIONS.map((opt) => ({
        id: opt.id,
        label: opt.label,
      })),
    []
  );

  const renderActionSelector = useCallback(
    () => (
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
    ),
    [
      control,
      platformOptionsForSelector,
      form.generator?.baseFormTabIndex?.platformSelectorTabIndex,
    ]
  );

  const renderFormInputs = useCallback(
    () => (
      <FormTextarea
        name="originalText"
        label="Inhalt"
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
    ),
    [control, form.generator?.tabIndex?.originalText, handleUrlsDetected]
  );

  const baseFormProps = form.generator?.baseFormProps || {};
  const generatedContentValue =
    typeof storeGeneratedText === 'string'
      ? storeGeneratedText
      : storeGeneratedText
        ? String(storeGeneratedText)
        : improvedContent;

  return (
    <BaseForm
      {...baseFormProps}
      onSubmit={() => handleSubmit<TextImproverFormValues>(onSubmitRHF)()}
      loading={loading}
      success={success}
      error={error}
      generatedContent={generatedContentValue}
      onGeneratedContentChange={handleGeneratedContentChange}
      componentName={componentName}
      firstExtrasChildren={renderActionSelector()}
      helpContent={HELP_CONTENT_CONFIG}
      platformOptions={platformOptionsForSelector}
    >
      {renderFormInputs()}
    </BaseForm>
  );
});

TextEditorTab.displayName = 'TextEditorTab';

export default TextEditorTab;
