import { useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { SHOW_SHAREPIC_STUDIO } from '../../config/featureFlags';
import { getToolGradient } from '../../config/toolTheme';
import { CANVAS_TOOLS, filterWorkplaceTools } from '../../config/workplaceToolsConfig';
import { useFirstName } from '../../hooks/useFirstName';
import { DocsComposer, type ComposerTemplate } from '../docs/DocsComposer';
import { useFeatureIndex } from '../global-search/useFeatureIndex';
import { useTourAutostart } from '../tours/useTourAutostart';
import { SharepicVorlagenSection } from '../vorlagen/components/SharepicVorlagenSection';
import { useSharepicVorlagen } from '../vorlagen/hooks/useSharepicVorlagen';
import { OFFICE_PILL_ROW, OfficeTilePill } from '../workplace/components/ToolsSection';

import { ExperimentalBadge } from './bild-editor-v2/BevBoxes';
import StudioGallerySections from './components/StudioGallerySections';
import { openSharepicCreator } from './freitext/openSharepicCreator';

// Sharepic-specific placeholder rotation (the composer otherwise shows the
// office doc/board/sheet examples). The long examples come from the country's
// Vorlagen; these stand in while the catalogue loads or is not rolled out.
const SEARCH_HINT = '… oder tippe, um zu suchen';
const SHAREPIC_PROMPT_EXAMPLES = [
  'Erstelle ein Sharepic zum Klimaschutz …',
  'Erstelle ein Zitat-Sharepic …',
  'Erstelle ein Sharepic für eine Veranstaltung …',
  'Erstelle eine Infografik zum Radverkehr …',
  SEARCH_HINT,
];
const STUDIO_VORLAGEN_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-4';
const SHAREPIC_PROMPT_EXAMPLES_SHORT = [
  'Sharepic erstellen …',
  'Zitat-Sharepic …',
  'Veranstaltung …',
  'Infografik …',
  '… oder tippen zum Suchen',
];

/**
 * "/studio" (Bilder & Videos) — the sharepic/graphics landing page, modelled on
 * the office landing pages: a hero with an AI composer (forced to the sharepic
 * kind) + the sharepic template gallery, the colourful tool strip (Vorlagen /
 * KI-Bilder / Sharepics / Reels), then the studio recents via the shared
 * StudioGallerySections. A written request goes to the Sharepic-Creator; a
 * Grünerator-Vorlage opens as an editable copy via /studio/vorlage/:id.
 */
const CanvasLandingContent = () => {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const featureIndex = useFeatureIndex();
  // The creator speaks both corporate designs, so the composer serves DE and AT.
  const sharepicEnabled = SHOW_SHAREPIC_STUDIO;
  const visibleCanvasTools = useMemo(() => filterWorkplaceTools(CANVAS_TOOLS), []);

  // Introduce the new Bilder & Videos surface once (like the editor tours).
  useTourAutostart('studio', true, () => {
    void import('../tours/studioTour').then((m) => m.startStudioTour());
  });

  const vorlagen = useSharepicVorlagen().data;
  const templates: ComposerTemplate[] = useMemo(
    () =>
      (vorlagen ?? []).map((v) => ({
        key: `sharepic-vorlage-${v.id}`,
        kind: 'sharepic' as const,
        id: v.id,
        title: v.titel,
        description: v.beschreibung,
      })),
    [vorlagen]
  );
  const promptExamples = useMemo(() => {
    const own = (vorlagen ?? []).map((v) => v.chat.prompts[0]!).slice(0, 4);
    return own.length > 0 ? [...own, SEARCH_HINT] : SHAREPIC_PROMPT_EXAMPLES;
  }, [vorlagen]);

  const handleGenerate = useCallback(
    (_kind: string, prompt: string) => {
      const description = prompt.trim();
      if (description) openSharepicCreator(navigate, description);
    },
    [navigate]
  );

  const handleTemplate = useCallback(
    (_kind: string, id: string) => void navigate(`/studio/vorlage/${id}`),
    [navigate]
  );

  return (
    <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('canvas')}>
      <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4" data-tour="studio-create">
        <h1 className="text-center text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif] [text-wrap:balance] max-sm:text-2xl">
          {firstName ? `Deine Bilder & Videos, ${firstName}` : 'Bilder & Videos'}
        </h1>

        <DocsComposer
          items={[]}
          templates={templates}
          featureIndex={featureIndex}
          isGenerating={false}
          sharepicEnabled={sharepicEnabled}
          forcedKind="sharepic"
          allowImports={false}
          promptExamples={promptExamples}
          promptExamplesShort={SHAREPIC_PROMPT_EXAMPLES_SHORT}
          onGenerate={handleGenerate}
          onSelectTemplate={handleTemplate}
          onImport={() => {}}
        />
        <p className="mt-3 flex items-center justify-center gap-2 text-sm">
          <Link
            to="/bild-editor"
            state={{ mode: 'sharepic' }}
            className="font-semibold text-foreground underline"
          >
            Sharepic aus Freitext gestalten
          </Link>
          <ExperimentalBadge />
        </p>
      </div>

      <section className="mb-xl mt-xl" data-tour="studio-tools">
        <div className={OFFICE_PILL_ROW}>
          {visibleCanvasTools.map((tool) => (
            <OfficeTilePill key={tool.id} tool={tool} themeKey="canvas" />
          ))}
        </div>
      </section>

      <SharepicVorlagenSection query="" limit={8} gridClassName={STUDIO_VORLAGEN_GRID} />

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
