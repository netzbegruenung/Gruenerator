import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm';
import FormStateProvider from '../../common/Form/FormStateProvider';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { useSharedContent } from '../../hooks/useSharedContent';
import ErrorBoundary from '../../ErrorBoundary';
import { useFormFields } from '../../common/Form/hooks';
import useBaseForm from '../../common/Form/hooks/useBaseForm';
import PlatformSelector from '../../common/PlatformSelector';

const GrueneJugendGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { Input, Textarea } = useFormFields();

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

  const helpContent = {
    content: "Dieser Grünerator erstellt jugendgerechte Social Media Inhalte und Aktionsideen speziell für die Grüne Jugend. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.",
    title: "Grüne Jugend",
    tips: [
      "Wähle ein aktuelles, jugendrelevantes Thema",
      "Formuliere Details verständlich und ansprechend",
      "TikTok und Instagram sind besonders effektiv für junge Zielgruppen",
      "Aktionsideen helfen bei der praktischen Umsetzung",
      "Instagram Reels erreichen eine große Reichweite"
    ]
  };

  const form = useBaseForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      platforms: defaultPlatforms,
      useWebSearchTool: false,
      usePrivacyMode: false
    },
    // Generator configuration
    generatorType: 'gruene-jugend',
    componentName: componentName,
    endpoint: '/claude_gruene_jugend',
    instructionType: 'gruenejugend',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'GRUENE_JUGEND',
    helpContent: helpContent
  });

  const renderPlatformSection = () => (
    <PlatformSelector
      name="platforms"
      control={form.control}
      platformOptions={platformOptions}
      label="Formate"
      placeholder="Formate auswählen..."
      required={true}
      tabIndex={form.generator.baseFormProps?.platformSelectorTabIndex}
    />
  );

  const renderFormInputs = () => (
    <>
      <Input
        name="thema"
        control={form.control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={form.generator.tabIndex?.thema}
      />

      <Textarea
        name="details"
        control={form.control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        tabIndex={form.generator.tabIndex?.details}
      />
    </>
  );

  // Extract static configuration for the store
  const formConfig = useMemo(() => ({
    tabIndex: {
      featureIcons: {
        webSearch: form.generator.tabIndex?.webSearch || 11,
        privacyMode: form.generator.tabIndex?.privacyMode || 12,
        attachment: form.generator.tabIndex?.attachment || 13
      },
      platformSelector: form.generator.baseFormTabIndex?.platformSelectorTabIndex || 12,
      knowledgeSelector: form.generator.baseFormTabIndex?.knowledgeSelectorTabIndex || 14,
      knowledgeSourceSelector: form.generator.baseFormTabIndex?.knowledgeSourceSelectorTabIndex || 13,
      documentSelector: form.generator.baseFormTabIndex?.documentSelectorTabIndex || 15,
      submitButton: form.generator.baseFormTabIndex?.submitButtonTabIndex || 17
    },
    ui: {
      enableKnowledgeSelector: true,
      enableDocumentSelector: true,
      showProfileSelector: true,
      enablePlatformSelector: false,
      useFeatureIcons: true
    },
    platform: {
      options: platformOptions
    }
  }), [platformOptions, form.generator.tabIndex, form.generator.baseFormTabIndex]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <FormStateProvider formId={componentName} initialState={formConfig}>
          <BaseForm
            title={helpContent.title}
            onSubmit={form.generator.onSubmit}
            loading={form.generator.loading}
            error={form.generator.error}
            success={form.generator.success}
            generatedContent={form.generator.generatedContent}
            onGeneratedContentChange={form.generator.handleGeneratedContentChange}
            componentName={componentName}
            helpContent={helpContent}
            formNotice={form.generator.formNotice}
            webSearchFeatureToggle={form.generator.baseFormProps?.webSearchFeatureToggle}
            privacyModeToggle={form.generator.baseFormProps?.privacyModeToggle}
            useWebSearchFeatureToggle={true}
            usePrivacyModeToggle={true}
            onAttachmentClick={form.generator.handleAttachmentClick}
            onRemoveFile={form.generator.handleRemoveFile}
            attachedFiles={form.generator.attachedFiles}
            firstExtrasChildren={renderPlatformSection()}
          >
            {renderFormInputs()}
          </BaseForm>
        </FormStateProvider>
      </div>
    </ErrorBoundary>
  );
};

GrueneJugendGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default GrueneJugendGenerator; 