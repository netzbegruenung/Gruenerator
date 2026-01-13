import React, { useState, useCallback, useMemo } from 'react';
import BaseForm from '../../components/common/BaseForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import { FormTextarea } from '../../components/common/Form/Input';
import PlatformSelector from '../../components/common/PlatformSelector';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../hooks/useUserInstructions';
import { useUrlCrawler } from '../../hooks/useUrlCrawler';
import { PiMagicWand, PiArrowsClockwise, PiTextAlignLeft, PiCheckCircle, PiBriefcase, PiTextAa } from 'react-icons/pi';

const AITextImproverGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'text-improver';
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const actionOptions = useMemo(() => [
    { id: 'improve', label: 'Verbessern', icon: <PiMagicWand size={16} /> },
    { id: 'rewrite', label: 'Umschreiben', icon: <PiArrowsClockwise size={16} /> },
    { id: 'summarize', label: 'Zusammenfassen', icon: <PiTextAlignLeft size={16} /> },
    { id: 'spellcheck', label: 'Rechtschreibung korrigieren', icon: <PiCheckCircle size={16} /> },
    { id: 'formalize', label: 'Formell machen', icon: <PiBriefcase size={16} /> },
    { id: 'simplify', label: 'Vereinfachen', icon: <PiTextAa size={16} /> }
  ], []);

  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  const customPrompt = useUserInstructions('text_improver', isInstructionsActive);

  const form = useBaseForm({
    defaultValues: {
      originalText: '',
      action: ['improve']
    },
    generatorType: 'text-improver',
    componentName: componentName,
    endpoint: '/claude_text_improver',
    instructionType: 'text_improver',
    features: ['privacyMode'],
    tabIndexKey: 'TEXT_IMPROVER',
    helpContent: {
      content: "Dieser Grünerator hilft dir, bestehende Texte zu verbessern, umzuschreiben oder zu transformieren.",
      tips: [
        "Füge deinen Text ein",
        "Wähle eine Aktion: Verbessern, Umschreiben, Zusammenfassen, etc.",
        "Der KI-Assistent bearbeitet deinen Text entsprechend der gewählten Aktion"
      ]
    }
  });

  const { control, handleSubmit } = form;

  const [improvedContent, setImprovedContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_text_improver');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  const {
    crawledUrls,
    detectAndCrawlUrls,
    isCrawling
  } = useUrlCrawler();

  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  const onSubmitRHF = useCallback(async (rhfData: { originalText: string; action: string | string[] }) => {
    setStoreIsLoading(true);

    try {
      const features = getFeatureState();
      const selectedAction = Array.isArray(rhfData.action) ? rhfData.action[0] : rhfData.action;

      const allAttachments = [
        ...(form.generator?.attachedFiles || []),
        ...crawledUrls
      ];

      const formDataToSubmit = {
        originalText: rhfData.originalText,
        action: selectedAction,
        ...features,
        attachments: allAttachments,
        customPrompt: customPrompt,
        selectedDocumentIds: selectedDocumentIds || [],
        selectedTextIds: selectedTextIds || [],
        searchQuery: rhfData.originalText?.substring(0, 200) || ''
      };

      const response = await submitForm(formDataToSubmit);

      if (response) {
        const content = typeof response === 'string' ? response : response.content;
        const metadata = typeof response === 'object' ? response.metadata : {};

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
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, form.generator, crawledUrls, selectedDocumentIds, selectedTextIds, getFeatureState]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setImprovedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const renderActionSelector = () => (
    <PlatformSelector
      name="action"
      control={control}
      platformOptions={actionOptions}
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

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator?.baseFormProps}
          title={<span className="gradient-title">Welchen Text willst du verbessern?</span>}
          onSubmit={() => handleSubmit(onSubmitRHF)()}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || improvedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          enableEditMode={true}
          componentName={componentName}
          firstExtrasChildren={renderActionSelector()}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default AITextImproverGenerator;
