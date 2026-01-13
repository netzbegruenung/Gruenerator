import React, { useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/Form/BaseForm/BaseForm';
import { FormInput, FormTextarea, FormImageSelect, FormSelect } from '../../../components/common/Form/Input';
import FeatureToggle from '../../../components/common/FeatureToggle';
import apiClient from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useGeneratorSetup, type FeatureState } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import CampaignSharepicEditor from './components/CampaignSharepicEditor';
import useCampaignSharepicEdit from './hooks/useCampaignSharepicEdit';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import { getActiveCampaigns, getCampaign } from '../../../utils/campaignLoader';
import { FaInstagram } from 'react-icons/fa';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import type { GeneratedContent } from '../../../types/baseform';
import './KampagnenGenerator.css';

// =============================================================================
// Type Definitions
// =============================================================================

interface KampagnenGeneratorProps {
  showHeaderFooter?: boolean;
}

interface CampaignVariant {
  id: string;
  displayName: string;
  description?: string;
  previewImage: string;
  canvaTemplateUrl?: string;
  order?: number;
}

interface CampaignFormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  maxLength?: number;
}

interface CampaignData {
  id: string;
  backendConfigId?: string;
  displayName?: string;
  description?: string;
  icon?: string;
  color?: string;
  order?: number;
  active?: boolean;
  enableCanvaEdit?: boolean;
  form?: {
    fields: CampaignFormField[];
    submitLabel?: string;
    countSelector?: {
      enabled: boolean;
      label: string;
      default: number;
      options: number[];
    };
  };
  variants?: CampaignVariant[];
}

interface CampaignOption {
  value: string;
  label: string;
  icon: ReactNode | null;
}

interface VariantOption {
  value: string;
  label: string;
  imageUrl: string;
}

interface SharepicData {
  type?: string;
  imageUrl?: string;
  lines?: Record<string, string>;
  canvaTemplateUrl?: string | null;
  canvaPreviewImage?: string | null;
}

interface EditedLines {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
}

interface CampaignGeneratedContent {
  sharepic: SharepicData[];
  inlineSharepicEditEnabled: boolean;
  content: string;
  enableCanvaEdit?: boolean;
  social?: { content: string };
}

interface CampaignFormData {
  variant: string;
  location: string;
  details: string;
}


interface UseCampaignSharepicEditReturn {
  regenerateSharepic: (params: {
    campaignId: string;
    variant: string;
    location: string;
    details: string;
    editedLines: EditedLines;
    features: FeatureState;
  }) => Promise<SharepicData>;
  isRegenerating: boolean;
  regenerationError: string | null;
  clearError: () => void;
}

const KampagnenGenerator: React.FC<KampagnenGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'kampagnen-generator';

  // Campaign data loaded from registry
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [selectedCampaignData, setSelectedCampaignData] = useState<CampaignData | null>(null);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(true);

  // Campaign selection state
  const [selectedCampaign, setSelectedCampaign] = useState<string>('weihnachten');

  // Load campaigns from registry on mount
  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        setIsLoadingCampaigns(true);
        const activeCampaigns = await getActiveCampaigns();
        // Cast campaigns with required id to CampaignData type (cast through unknown for type compatibility)
        setCampaigns(activeCampaigns.filter(c => c.id) as unknown as CampaignData[]);

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
        // Cast campaign with required id to CampaignData type (cast through unknown for type compatibility)
        if (campaignData?.id) {
          setSelectedCampaignData(campaignData as unknown as CampaignData);
        }
      } catch (error) {
        console.error('[KampagnenGenerator] Failed to load campaign data:', error);
      }
    };

    loadCampaignData();
  }, [selectedCampaign]);

  // Campaign variant options (loaded dynamically from registry)
  const campaignVariantOptions = useMemo((): VariantOption[] => {
    if (!selectedCampaignData?.variants) return [];

    return selectedCampaignData.variants.map((variant: CampaignVariant): VariantOption => ({
      value: variant.id,
      label: variant.displayName,
      imageUrl: variant.previewImage
    }));
  }, [selectedCampaignData]);

  // Campaign type options for selector (loaded from registry)
  const campaignOptions = useMemo((): CampaignOption[] => {
    return campaigns.map((campaign: CampaignData): CampaignOption => ({
      value: campaign.id,
      label: campaign.displayName,
      icon: campaign.icon ? <Icon category="campaigns" name={campaign.icon} size={16} /> : null
    }));
  }, [campaigns]);

  // Campaign text generation toggle state
  const [generateCampaignText, setGenerateCampaignText] = useState<boolean>(false);

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
  } = form as { control: Record<string, unknown>; handleSubmit: (onSubmit: (data: CampaignFormData) => Promise<void>) => () => Promise<void>; getValues: () => CampaignFormData; errors: { location?: { message?: string }; details?: { message?: string }; variant?: { message?: string } } };

  // Consolidated setup using new hook
  const setup = useGeneratorSetup({
    instructionType: 'social',
    componentName: componentName
  });

  // Memoized attachments array (campaigns don't typically have crawled URLs, but keep pattern consistent)
  const allAttachments = useMemo(() => [
    ...(form.generator?.attachedFiles || [])
  ], [form.generator?.attachedFiles]);

  // Form data builder with campaign-specific fields
  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['location', 'details'] as const
  });

  // Store integration
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName)) as unknown as CampaignGeneratedContent | null;

  // Loading state for generation
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // State for active sharepic index (synced with ImageDisplay)
  const [activeSharepicIndex, setActiveSharepicIndex] = useState<number>(0);

  // State for tracking edited lines from CampaignSharepicEditor
  const [editedLines, setEditedLines] = useState<EditedLines | null>(null);

  // State for tracking if we're in image edit mode
  const [isImageEditMode, setIsImageEditMode] = useState<boolean>(false);

  // Campaign sharepic edit hook
  const { regenerateSharepic, isRegenerating, regenerationError, clearError } = useCampaignSharepicEdit() as UseCampaignSharepicEditReturn;

  // Handler for regenerating a single sharepic with edited text
  const handleRegenerateSharepic = useCallback(async (index: number, editedLinesParam: EditedLines) => {
    try {
      const formValues = getValues() as CampaignFormData;
      const campaignId = selectedCampaignData?.backendConfigId || selectedCampaign;

      const updatedSharepic = await regenerateSharepic({
        campaignId: campaignId,
        variant: formValues.variant,
        location: formValues.location,
        details: formValues.details,
        editedLines: editedLinesParam,
        features: setup.getFeatureState()
      });

      const currentSharepics = storeGeneratedText?.sharepic || [];
      const updatedSharepics = [...currentSharepics];
      updatedSharepics[index] = updatedSharepic;

      const updatedResult = {
        sharepic: updatedSharepics,
        inlineSharepicEditEnabled: true,
        content: 'sharepic-content'
      };

      setGeneratedText(componentName, updatedResult as unknown as string);
    } catch (error) {
      console.error('[KampagnenGenerator] Failed to regenerate sharepic:', error);
      throw error;
    }
  }, [regenerateSharepic, storeGeneratedText, setGeneratedText, setup, getValues, selectedCampaignData, selectedCampaign, componentName]);

  const onSubmitRHF = useCallback(async (rhfData: CampaignFormData) => {
    if (isImageEditMode && editedLines) {
      await handleRegenerateSharepic(activeSharepicIndex, editedLines);
      return;
    }

    setStoreIsLoading(true);
    setIsGenerating(true);

    try {
      // Build submission data using builder (includes features, attachments, selections)
      const submissionData = builder.buildSubmissionData(rhfData as unknown as Record<string, unknown>);

      // Get backend campaign ID from selected campaign data
      const campaignId = selectedCampaignData?.backendConfigId || selectedCampaign;

      // Merge with campaign-specific fields
      const response = await apiClient.post('campaign_generate', {
        ...submissionData,
        campaignId: campaignId,
        campaignTypeId: rhfData.variant,
        thema: rhfData.location,
        count: 4,
        generateCampaignText: generateCampaignText
      });

      const result = response.data;

      if (!result.success || !result.sharepics || result.sharepics.length === 0) {
        throw new Error('Keine Sharepics empfangen');
      }

      // Enrich sharepics with Canva template URLs from campaign variant config
      const enrichedSharepics = result.sharepics.map((sp: SharepicData) => {
        const variant = selectedCampaignData?.variants?.find((v: CampaignVariant) => v.id === sp.type);
        return {
          ...sp,
          canvaTemplateUrl: variant?.canvaTemplateUrl || null,
          canvaPreviewImage: variant?.previewImage || null
        };
      });

      const finalResult: {
        sharepic: typeof enrichedSharepics;
        inlineSharepicEditEnabled: boolean;
        content: string;
        enableCanvaEdit: boolean;
        social?: { content: string };
      } = {
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

      setGeneratedText(componentName, finalResult as unknown as string);

    } catch (error) {
      console.error('[KampagnenGenerator] Generation error:', error);
      throw error;
    } finally {
      setStoreIsLoading(false);
      setIsGenerating(false);
    }
  }, [isImageEditMode, editedLines, activeSharepicIndex, handleRegenerateSharepic, setGeneratedText, setStoreIsLoading, builder, selectedCampaign, selectedCampaignData, componentName, generateCampaignText]);

  const handleGeneratedContentChange = useCallback((content: string) => {
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
        onSubmit={() => handleSubmit(onSubmitRHF)()}
        loading={isGenerating || isRegenerating}
        success={!!storeGeneratedText}
        error={form.generator?.error}
        generatedContent={storeGeneratedText as unknown as GeneratedContent}
        onGeneratedContentChange={handleGeneratedContentChange}
        componentName={componentName}
        useFeatureIcons={false}
        helpContent={helpContent}
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
