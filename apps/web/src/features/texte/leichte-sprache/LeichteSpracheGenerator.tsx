import React, { useState, useCallback } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

interface LeichteSpracheGeneratorProps {
  showHeaderFooter?: boolean;
}

const LeichteSpracheGenerator: React.FC<LeichteSpracheGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'leichte-sprache';
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Get feature state and selection from store
  // Use proper selectors for reactive subscriptions
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  // Fetch user's custom instructions
  const customPrompt = useUserInstructions('leichte_sprache', isInstructionsActive);

  // Initialize useBaseForm with knowledge system enabled
  const form = useBaseForm({
    defaultValues: {
      originalText: '',
      targetLanguage: 'Deutsch'
    },
    generatorType: 'leichte-sprache',
    componentName: componentName,
    endpoint: '/leichte_sprache',
    instructionType: 'leichte_sprache',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'LEICHTE_SPRACHE',
    helpContent: {
      content: "Dieser Grünerator übersetzt Texte in Leichte Sprache. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.",
      tips: [
        "Füge den zu übersetzenden Text in das Textfeld ein",
        "Der Text wird automatisch nach den Regeln der Leichten Sprache übersetzt",
        "Die Regeln folgen dem Netzwerk Leichte Sprache e.V. (Neuauflage 2022)",
        "Die Übersetzung erfolgt in kurzen, klaren Sätzen",
        "Schwierige Wörter werden erklärt oder ersetzt"
      ]
    }
  });

  const { control, handleSubmit } = form;

  const [translatedContent, setTranslatedContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/leichte_sprache');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

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

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url: string) => {
    await retryUrl(url, usePrivacyMode);
  }, [retryUrl, usePrivacyMode]);

  const onSubmitRHF = useCallback(async (rhfData: any) => {
    setStoreIsLoading(true);

    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...form.generator.attachedFiles,
        ...crawledUrls
      ];

      const formDataToSubmit = {
        originalText: rhfData.originalText,
        targetLanguage: rhfData.targetLanguage,
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
        attachments: allAttachments
      };

      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.originalText) queryParts.push(data.originalText);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(formDataToSubmit);

      // Add custom prompt from user instructions (simplified)
      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
      formDataToSubmit.selectedTextIds = selectedTextIds || [];
      formDataToSubmit.searchQuery = searchQuery || '';

      const response = await submitForm(formDataToSubmit);
      if (response) {
        // Handle both old string format and new {content, metadata} format
        const content = typeof response === 'string' ? response : response.content;
        const metadata = typeof response === 'object' ? response.metadata : {};

        if (content) {
          setTranslatedContent(content);
          setGeneratedText(componentName, content, metadata);
          setTimeout(resetSuccess, 3000);
        }
      }
    } catch (submitError) {
      console.error('[LeichteSpracheGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, form.generator, crawledUrls, selectedDocumentIds, selectedTextIds, getFeatureState]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setTranslatedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const renderFormInputs = () => (
    <>
      <FormTextarea
        name="originalText"
        control={control}
        placeholder="Gib hier den Text ein, der in Leichte Sprache übersetzt werden soll..."
        rules={{ required: 'Text ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={form.generator.tabIndex.originalText}
        enableUrlDetection={true}
        onUrlsDetected={handleUrlsDetected}
      />
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator.baseFormProps}
          title={<span className="gradient-title">Welchen Text willst du heute vereinfachen?</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || translatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default LeichteSpracheGenerator;
