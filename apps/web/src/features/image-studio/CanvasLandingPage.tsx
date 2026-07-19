import { isCanvasTemplateType } from '@gruenerator/contracts';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { SHOW_SHAREPIC_STUDIO } from '../../config/featureFlags';
import { getToolGradient } from '../../config/toolTheme';
import { CANVAS_TOOLS } from '../../config/workplaceToolsConfig';
import { useFirstName } from '../../hooks/useFirstName';
import { generateSharepicFromPrompt } from '../../services/sharepicPromptService';
import { useAuthStore } from '../../stores/authStore';
import useImageStudioStore from '../../stores/imageStudioStore';
import { DocsComposer, type ComposerTemplate } from '../docs/DocsComposer';
import { useFeatureIndex } from '../global-search/useFeatureIndex';
import { SectionHeading, TOOL_GRID, ToolTile } from '../workplace/components/ToolsSection';

import StudioGallerySections from './components/StudioGallerySections';
import { IMAGE_STUDIO_CATEGORIES, getTypesForCategory } from './utils/typeConfig';

// Sharepic-specific placeholder rotation (the composer otherwise shows the
// office doc/board/sheet examples).
const SHAREPIC_PROMPT_EXAMPLES = [
  'Erstelle ein Sharepic zum Klimaschutz …',
  'Erstelle ein Zitat-Sharepic …',
  'Erstelle ein Sharepic für eine Veranstaltung …',
  'Erstelle eine Info-Grafik zum Radverkehr …',
  '… oder tippe, um zu suchen',
];
const SHAREPIC_PROMPT_EXAMPLES_SHORT = [
  'Sharepic erstellen …',
  'Zitat-Sharepic …',
  'Veranstaltung …',
  'Info-Grafik …',
  '… oder tippen zum Suchen',
];

/**
 * "/canvas" — the sharepic/graphics landing page, modelled on the office landing
 * pages: a hero with an AI composer (forced to the sharepic kind) + the sharepic
 * template gallery, then the studio recents (Sharepics / Imagine / Reels) via the
 * shared StudioGallerySections. Creation navigates into the existing
 * /studio/templates/:type and /imagine flows.
 */
const CanvasLandingContent = () => {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const locale = useAuthStore((s) => s.locale);
  const featureIndex = useFeatureIndex();
  const loadFromAIGeneration = useImageStudioStore((s) => s.loadFromAIGeneration);
  // Sharepic creation is a research preview; AT users create via the external
  // bildgenerator, so the composer only offers it for DE with the flag on.
  const sharepicEnabled = SHOW_SHAREPIC_STUDIO && locale !== 'de-AT';
  const [creating, setCreating] = useState(false);

  const templates: ComposerTemplate[] = useMemo(
    () =>
      getTypesForCategory(IMAGE_STUDIO_CATEGORIES.TEMPLATES).map((t) => ({
        key: `sharepic-${t.id}`,
        kind: 'sharepic' as const,
        id: t.id,
        title: t.label,
        description: t.description ?? 'Sharepic-Vorlage',
      })),
    []
  );

  // Same flow as the DocsPage composer's sharepic branch: classify the prompt
  // into a template (or KI image), pre-fill the canvas store, open the flow.
  const handleGenerate = useCallback(
    async (_kind: string, prompt: string) => {
      const description = prompt.trim();
      if (!description || creating) return;
      setCreating(true);
      try {
        const result = await generateSharepicFromPrompt(description);
        if (!result.success) {
          console.error('[CanvasLandingPage] sharepic generation failed:', result.error);
          return;
        }
        if (result.isKiType) {
          void navigate('/imagine/pure-create');
          return;
        }
        if (!isCanvasTemplateType(result.type)) {
          console.warn('[CanvasLandingPage] non-canonical sharepic type:', result.type);
          return;
        }
        loadFromAIGeneration(
          result.type,
          result.data as unknown as Record<string, string>,
          result.selectedImage
        );
        void navigate(`/studio/templates/${result.type}`);
      } catch (err) {
        console.error('[CanvasLandingPage] composer create failed:', err);
      } finally {
        setCreating(false);
      }
    },
    [creating, navigate, loadFromAIGeneration]
  );

  const handleTemplate = useCallback(
    (_kind: string, id: string) => void navigate(`/studio/templates/${id}`),
    [navigate]
  );

  return (
    <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('canvas')}>
      <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
        <h1 className="text-center text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif] [text-wrap:balance] max-sm:text-2xl">
          {firstName ? `Deine Bilder & Grafiken, ${firstName}` : 'Bilder & Grafiken'}
        </h1>

        <DocsComposer
          items={[]}
          templates={templates}
          featureIndex={featureIndex}
          isGenerating={creating}
          sharepicEnabled={sharepicEnabled}
          forcedKind="sharepic"
          allowImports={false}
          promptExamples={SHAREPIC_PROMPT_EXAMPLES}
          promptExamplesShort={SHAREPIC_PROMPT_EXAMPLES_SHORT}
          onGenerate={handleGenerate}
          onSelectTemplate={handleTemplate}
          onImport={() => {}}
        />
      </div>

      <section className="mb-xl mt-2xl">
        <SectionHeading title="Tools" />
        <div className={TOOL_GRID}>
          {CANVAS_TOOLS.map((tool) => (
            <ToolTile key={tool.id} tool={tool} />
          ))}
        </div>
      </section>

      <StudioGallerySections />
    </PageContainer>
  );
};

const CanvasLandingPage = () => (
  <ErrorBoundary>
    <CanvasLandingContent />
  </ErrorBoundary>
);

export default CanvasLandingPage;
