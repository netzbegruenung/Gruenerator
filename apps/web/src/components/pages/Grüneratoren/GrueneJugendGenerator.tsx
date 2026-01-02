import { useState, useCallback, useMemo } from 'react';
import { Controller } from 'react-hook-form';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
import ErrorBoundary from '../../ErrorBoundary';
import { FormInput, FormTextarea } from '../../common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import PlatformSelector from '../../common/PlatformSelector';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useBaseForm from '../../common/Form/hooks/useBaseForm';

interface GrueneJugendGeneratorProps {
  showHeaderFooter?: boolean;
}

const GrueneJugendGenerator = ({ showHeaderFooter = true }: GrueneJugendGeneratorProps): JSX.Element => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Get feature state and selection from store
  // Use proper selectors for reactive subscriptions
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  // Fetch user's custom instructions
  const instructionType = 'gruenejugend';
  const customPrompt = useUserInstructions(instructionType, isInstructionsActive);

  const platformOptions = useMemo(() => [
    { id: 'instagram', label: 'Instagram' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'reelScript', label: 'Skript für Reels & Tiktoks' },
    { id: 'actionIdeas', label: 'Aktionsideen' }
  ], []);

  const defaultPlatforms = useMemo(() => {
    // Determine default platforms based on initial content
    if (initialContent?.platforms) {
      const selectedPlatforms = Object.keys(initialContent.platforms).filter(
        key => initialContent.platforms[key]
      );
      if (selectedPlatforms.length > 0) {
        return selectedPlatforms; // Return all selected platforms
      }
    }

    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      return ['instagram'];
    }

    return []; // No default selection
  }, [initialContent]);

  // Initialize useBaseForm with knowledge system enabled
  const form = useBaseForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      platforms: defaultPlatforms
    },
    generatorType: 'gruene-jugend',
    componentName: componentName,
    endpoint: '/claude_gruene_jugend',
    instructionType: 'gruenejugend',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'GRUENE_JUGEND',
    defaultMode: 'privacy',
    helpContent: {
      content: "Der Grünerator für die Grüne Jugend erstellt jugendgerechte Social-Media-Inhalte für verschiedene Plattformen.",
      tips: [
        "Wähle die Plattformen aus, für die du Content erstellen möchtest",
        "Gib ein klares Thema und relevante Details an",
        "Der Grünerator passt Tonalität und Format automatisch an die Zielgruppe an",
        "Nutze die Websuche für aktuelle Informationen"
      ]
    }
  });

  const { control, handleSubmit, setValue } = form;

  // Use store for content management (no local state needed)
  const socialMediaContent = useGeneratedTextStore(state => state.getGeneratedText(componentName)) || '';
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_gruene_jugend');

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

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);
    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...form.generator.attachedFiles,
        ...crawledUrls
      ];

      const formDataToSubmit = {
        thema: rhfData.thema,
        details: rhfData.details,
        platforms: selectedPlatforms,
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
        attachments: allAttachments
      };

      // Extract search query from form data
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.thema) queryParts.push(data.thema);
        if (data.details) queryParts.push(data.details);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(rhfData);

      // Add custom prompt from user instructions (simplified)
      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
      formDataToSubmit.selectedTextIds = selectedTextIds || [];
      formDataToSubmit.searchQuery = searchQuery || '';

      console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formDataToSubmit);
      const content = await submitForm(formDataToSubmit);
      console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
      if (content) {
        console.log('[GrueneJugendGenerator] Setze generierten Content:', content.substring(0, 100) + '...');
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, form.generator, crawledUrls, selectedDocumentIds, selectedTextIds, getFeatureState]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls) => {
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  const renderPlatformSection = () => (
    <PlatformSelector
      name="platforms"
      control={control}
      platformOptions={platformOptions}
      label="Formate"
      placeholder="Formate auswählen..."
      required={true}
      tabIndex={form.generator.baseFormTabIndex.platformSelectorTabIndex}
    />
  );

  const renderFormInputs = () => (
    <>
      <FormInput
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={form.generator.tabIndex.thema}
      />

      <FormTextarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        tabIndex={form.generator.tabIndex.details}
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
          title={<span className="gradient-title">Grüne Jugend</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          firstExtrasChildren={renderPlatformSection()}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default GrueneJugendGenerator;
