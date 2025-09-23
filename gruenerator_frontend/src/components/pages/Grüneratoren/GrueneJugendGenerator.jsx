import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm';
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
      helpText="Wähle ein oder mehrere Formate für die dein Content optimiert werden soll"
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


  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator.baseFormProps}
          onSubmit={form.generator.onSubmit}
          firstExtrasChildren={renderPlatformSection()}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

GrueneJugendGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default GrueneJugendGenerator; 