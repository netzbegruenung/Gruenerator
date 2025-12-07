import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/Form/BaseForm/BaseForm';
import { FormInput, FormTextarea, FormImageSelect, FormSelect } from '../../../components/common/Form/Input';
import FeatureToggle from '../../../components/common/FeatureToggle';
import apiClient from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import CampaignSharepicEditor from './components/CampaignSharepicEditor';
import useCampaignSharepicEdit from './hooks/useCampaignSharepicEdit';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import { getActiveCampaigns, getCampaign } from '../../../utils/campaignLoader';
import { FaInstagram } from 'react-icons/fa';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import './KampagnenGenerator.css';

const KampagnenGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'kampagnen-generator';

  // Campaign data loaded from registry
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignData, setSelectedCampaignData] = useState(null);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);

  // Campaign selection state
  const [selectedCampaign, setSelectedCampaign] = useState('weihnachten');

  // Load campaigns from registry on mount
  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        setIsLoadingCampaigns(true);
        const activeCampaigns = await getActiveCampaigns();
        setCampaigns(activeCampaigns);

        if (activeCampaigns.length > 0 && !selectedCampaign) {
          setSelectedCampaign(activeCampaigns[0].id);
        }
      } catch (error) {
        console.error('[KampagnenGenerator] Failed to load campaigns:', error);
      } finally {
        setIsLoadingCampaigns(false);
      }
    };

    loadCampaigns();
  }, []);

  // Load selected campaign data when selection changes
  useEffect(() => {
    const loadCampaignData = async () => {
      if (!selectedCampaign) return;

      try {
        const campaignData = await getCampaign(selectedCampaign);
        setSelectedCampaignData(campaignData);
      } catch (error) {
        console.error('[KampagnenGenerator] Failed to load campaign data:', error);
      }
    };

    loadCampaignData();
  }, [selectedCampaign]);

  // Campaign variant options (loaded dynamically from registry)
  const campaignVariantOptions = useMemo(() => {
    if (!selectedCampaignData?.variants) return [];

    return selectedCampaignData.variants.map(variant => ({
      value: variant.id,
      label: variant.displayName,
      imageUrl: variant.previewImage
    }));
  }, [selectedCampaignData]);

  // Campaign type options for selector (loaded from registry)
  const campaignOptions = useMemo(() => {
    return campaigns.map(campaign => ({
      value: campaign.id,
      label: campaign.displayName,
      icon: campaign.icon ? <Icon category="campaigns" name={campaign.icon} size={16} /> : null
    }));
  }, [campaigns]);

  // Campaign text generation toggle state
  const [generateCampaignText, setGenerateCampaignText] = useState(false);

  // Use useBaseForm for integrated form management
  const form = useBaseForm({
    defaultValues: {
      variant: campaignVariantOptions[0]?.value || '',
      location: '',
      details: ''
    },
    shouldUnregister: false,
    generatorType: 'kampagnen',
    componentName: componentName,
    endpoint: '/campaign_generate',
    features: ['privacyMode', 'proMode'],
    tabIndexKey: 'KAMPAGNEN',
    disableKnowledgeSystem: true
  });

  const {
    control,
    handleSubmit,
    getValues,
    errors
  } = form;

  // Store integration
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);

  // Loading state for generation
  const [isGenerating, setIsGenerating] = useState(false);

  // State for active sharepic index (synced with ImageDisplay)
  const [activeSharepicIndex, setActiveSharepicIndex] = useState(0);

  // State for tracking edited lines from CampaignSharepicEditor
  const [editedLines, setEditedLines] = useState(null);

  // State for tracking if we're in image edit mode
  const [isImageEditMode, setIsImageEditMode] = useState(false);

  // Campaign sharepic edit hook
  const { regenerateSharepic, isRegenerating, regenerationError, clearError } = useCampaignSharepicEdit();

  // Handler for regenerating a single sharepic with edited text
  const handleRegenerateSharepic = useCallback(async (index, editedLines) => {
    try {
      const formValues = getValues();
      const campaignId = selectedCampaignData?.backendConfigId || selectedCampaign;

      const updatedSharepic = await regenerateSharepic({
        campaignId: campaignId,
        variant: formValues.variant,
        location: formValues.location,
        details: formValues.details,
        editedLines,
        features: getFeatureState()
      });

      const currentSharepics = storeGeneratedText?.sharepic || [];
      const updatedSharepics = [...currentSharepics];
      updatedSharepics[index] = updatedSharepic;

      const updatedResult = {
        sharepic: updatedSharepics,
        inlineSharepicEditEnabled: true,
        content: 'sharepic-content'
      };

      setGeneratedText(componentName, updatedResult);
    } catch (error) {
      console.error('[KampagnenGenerator] Failed to regenerate sharepic:', error);
      throw error;
    }
  }, [regenerateSharepic, storeGeneratedText, setGeneratedText, getFeatureState, getValues, selectedCampaignData, selectedCampaign, componentName]);

  const onSubmitRHF = useCallback(async (rhfData) => {
    if (isImageEditMode && editedLines) {
      await handleRegenerateSharepic(activeSharepicIndex, editedLines);
      return;
    }

    setStoreIsLoading(true);
    setIsGenerating(true);

    try {
      const features = getFeatureState();

      // Get backend campaign ID from selected campaign data
      const campaignId = selectedCampaignData?.backendConfigId || selectedCampaign;

      const response = await apiClient.post('campaign_generate', {
        campaignId: campaignId,
        campaignTypeId: rhfData.variant,
        thema: rhfData.location,
        details: rhfData.details || '',
        count: 4,
        generateCampaignText: generateCampaignText,
        ...features
      });

      const result = response.data;

      if (!result.success || !result.sharepics || result.sharepics.length === 0) {
        throw new Error('Keine Sharepics empfangen');
      }

      // Enrich sharepics with Canva template URLs from campaign variant config
      const enrichedSharepics = result.sharepics.map((sp) => {
        const variant = selectedCampaignData?.variants?.find(v => v.id === sp.type);
        return {
          ...sp,
          canvaTemplateUrl: variant?.canvaTemplateUrl || null,
          canvaPreviewImage: variant?.previewImage || null
        };
      });

      const finalResult = {
        sharepic: enrichedSharepics,
        inlineSharepicEditEnabled: true,
        content: 'sharepic-content',
        enableCanvaEdit: selectedCampaignData?.enableCanvaEdit ?? false
      };

      // Add campaign text if generated
      if (result.campaignText) {
        finalResult.social = {
          content: result.campaignText
        };
      }

      setGeneratedText(componentName, finalResult);

    } catch (error) {
      console.error('[KampagnenGenerator] Generation error:', error);
      throw error;
    } finally {
      setStoreIsLoading(false);
      setIsGenerating(false);
    }
  }, [isImageEditMode, editedLines, activeSharepicIndex, handleRegenerateSharepic, setGeneratedText, setStoreIsLoading, getFeatureState, selectedCampaign, selectedCampaignData, componentName, generateCampaignText]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Help content for the generator
  const helpContent = {
    content: "Dieser Grünerator erstellt festliche Weihnachtsgrüße für deine Region mit grünen Werten. Wähle einen Hintergrund und gib deinen Ort ein - der Rest wird automatisch grüneriert.",
    tips: [
      "Wähle ein Hintergrund-Design aus 6 festlichen Varianten",
      "Gib deinen Ort oder deine Region ein (z.B. Hamburg, Köln, München)",
      "Optional: Füge Details wie lokale Besonderheiten oder aktuelle Themen hinzu",
      "Der Grünerator erstellt ein 5-zeiliges Weihnachtsgedicht passend zu deinem Ort",
      "Das fertige Sharepic kann direkt heruntergeladen und geteilt werden"
    ]
  };

  // Render campaign selector
  const renderCampaignSelector = () => (
    <PlatformSelector
      name="campaignType"
      options={campaignOptions}
      value={selectedCampaign}
      onChange={setSelectedCampaign}
      label="Kampagne"
      placeholder="Kampagne auswählen..."
      isMulti={false}
      control={null}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  );

  // Render form inputs
  const renderFormInputs = () => (
    <>
      <FormImageSelect
        name="variant"
        control={control}
        label="Hintergrund-Design"
        options={campaignVariantOptions}
        rules={{ required: 'Bitte wähle ein Design aus' }}
        required
        columns={{ desktop: 3, tablet: 2, mobile: 1 }}
        aspectRatio="4 / 5"
        showLabel={false}
      />

      <FormInput
        name="location"
        control={control}
        label="Ort / Region"
        placeholder="z.B. Hamburg, Berlin, Köln, München..."
        rules={{
          required: 'Bitte gib einen Ort oder eine Region ein',
          minLength: { value: 2, message: 'Der Ort muss mindestens 2 Zeichen lang sein' }
        }}
        error={errors.location?.message}
        tabIndex={form.generator?.tabIndex?.location}
      />

      <FormTextarea
        name="details"
        control={control}
        label="Zusätzliche Details (optional)"
        placeholder="z.B. lokale Besonderheiten, aktuelle Themen, besondere Schwerpunkte..."
        rows={4}
        error={errors.details?.message}
        tabIndex={form.generator?.tabIndex?.details}
      />
    </>
  );

  const customEditContent = storeGeneratedText?.sharepic?.length > 0 ? (
    <CampaignSharepicEditor
      sharepics={storeGeneratedText.sharepic}
      activeIndex={activeSharepicIndex}
      onEditedLinesChange={setEditedLines}
      regenerationError={regenerationError}
      onClearError={clearError}
    />
  ) : null;

  return (
    <div className="kampagnen-generator">
      <BaseForm
        key={selectedCampaign}
        title="Weihnachtskampagne 2025"
        subtitle="Erstelle festliche Weihnachtsgrüße mit grünen Werten für deine Region"
        onSubmit={handleSubmit(onSubmitRHF)}
        loading={isGenerating || isRegenerating}
        success={!!storeGeneratedText}
        error={form.generator?.error}
        generatedContent={storeGeneratedText}
        onGeneratedContentChange={handleGeneratedContentChange}
        componentName={componentName}
        useFeatureIcons={false}
        helpContent={helpContent}
        showHeader={showHeaderFooter}
        showFooter={showHeaderFooter}
        enableEditMode={true}
        customEditContent={customEditContent}
        onImageEditModeChange={setIsImageEditMode}
        firstExtrasChildren={renderCampaignSelector()}
        extrasChildren={
          <FeatureToggle
            isActive={generateCampaignText}
            onToggle={setGenerateCampaignText}
            label="Beitragstext generieren"
            icon={FaInstagram}
            description="Zusätzlich einen passenden Social-Media-Text erstellen"
            className="campaign-feature-toggle"
          />
        }
      >
        {renderFormInputs()}
      </BaseForm>
    </div>
  );
};

export default withAuthRequired(KampagnenGenerator, {
  title: 'Kampagnen',
  message: 'Melde dich an, um den Kampagnen-Grünerator zu nutzen.'
});
