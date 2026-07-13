import { isCanvasTemplateType } from '@gruenerator/contracts';
import { AIPromptInput } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';
import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { SHOW_SHAREPIC_STUDIO } from '../../../config/featureFlags';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { SharepicResearchPreviewBanner } from '../researchPreviewWarning';

import StudioGallerySections from './StudioGallerySections';

const EXAMPLE_PROMPTS = [
  { label: 'Zitat', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
  { label: 'Sharepic', text: 'Sharepic mit 3 Zeilen über Windenergie' },
  { label: 'Info', text: 'Info-Grafik über erneuerbare Energien' },
];

const ImageStudioCategorySelector: React.FC = () => {
  const navigate = useNavigate();
  const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
  const user = useAuthStore((s) => s.user);

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const firstName = useMemo(() => {
    const displayName = user?.display_name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const isAustrianUser = user?.locale === 'de-AT';

  const handlePromptSubmit = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();

      const trimmedPrompt = promptInput.trim();
      if (!trimmedPrompt || isGenerating) return;

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const result = await generateSharepicFromPrompt(trimmedPrompt);

        if (!result.success) {
          setGenerationError(result.error || 'Ein Fehler ist aufgetreten');
          setIsGenerating(false);
          return;
        }

        if (result.isKiType) {
          void navigate(`/imagine/pure-create`);
          return;
        }

        // Boundary guard: SharepicType statically includes KI ids and the API
        // response is cast — validate against the canonical canvas enum before
        // it can reach the studio store / mint.
        if (!isCanvasTemplateType(result.type)) {
          console.warn('[ImageStudioCategorySelector] non-canonical sharepic type:', result.type);
          setGenerationError('Unbekannter Vorlagentyp — bitte erneut versuchen.');
          return;
        }

        loadFromAIGeneration(
          result.type,
          result.data as unknown as Record<string, string>,
          result.selectedImage
        );

        void navigate(`/studio/templates/${result.type}`);
      } catch (error: unknown) {
        setGenerationError(
          (error instanceof Error ? error.message : String(error)) || 'Ein Fehler ist aufgetreten'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [promptInput, isGenerating, loadFromAIGeneration, navigate]
  );

  return (
    <PageContainer maxWidth="lg">
      {/* AT users are routed to the external bildgenerator and never reach the
          canvas creator, so the research-preview notice doesn't apply to them. */}
      {SHOW_SHAREPIC_STUDIO && !isAustrianUser && (
        <SharepicResearchPreviewBanner className="mb-lg" />
      )}
      <div className="text-center mb-lg pt-md">
        <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
          {firstName ? `Hallo, ${firstName}!` : 'Studio'}
        </h1>
        <p className="text-lg text-grey-500 dark:text-grey-400">
          Erstelle Sharepics, KI-Bilder und Videos.
        </p>
      </div>

      {SHOW_SHAREPIC_STUDIO && !isAustrianUser && (
        <div className="mb-xl">
          <AIPromptInput
            useDictation={useVoxtralDictation}
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handlePromptSubmit}
            placeholder="Beschreibe dein Sharepic..."
            isLoading={isGenerating}
            error={generationError}
            examples={EXAMPLE_PROMPTS}
          />
        </div>
      )}

      <StudioGallerySections />
    </PageContainer>
  );
};

export default ImageStudioCategorySelector;
