import { type ComposerOption, ComposerOptionPicker } from '@gruenerator/chat';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { HiOutlineSparkles } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { SHOW_SHAREPIC_STUDIO } from '../../config/featureFlags';
import { getToolGradient } from '../../config/toolTheme';
import { CANVAS_TOOLS, filterWorkplaceTools } from '../../config/workplaceToolsConfig';
import { useFirstName } from '../../hooks/useFirstName';
import { DocsComposer } from '../docs/DocsComposer';
import { detectDocType } from '../docs/docTypeMeta';
import { useFeatureIndex } from '../global-search/useFeatureIndex';
import { useTourAutostart } from '../tours/useTourAutostart';
import { PopularVorlagenRow } from '../vorlagen/components/PopularVorlagenRow';
import { useSharepicVorlagen } from '../vorlagen/hooks/useSharepicVorlagen';
import {
  OFFICE_PILL_ROW,
  OfficeActionPill,
  OfficeTilePill,
} from '../workplace/components/ToolsSection';

import { type BevMode } from './bild-editor-v2/types';
import { type BevEntryState, fileToDownscaledDataUrl } from './bild-editor-v2/useBildEditorV2';
import StudioGallerySections from './components/StudioGallerySections';
import { type FreitextHandoff } from './freitext/freitextHandoff';
import {
  MAX_PHOTOS,
  PHOTO_ACCEPT,
  photoFileProblem,
  preparePhoto,
} from './freitext/sharepicPhotos';
import { tabUrl } from './tabHandoff';

interface LandingPhoto {
  id: string;
  name: string;
  file: File;
}

type StudioMode = 'auto' | 'sharepic' | 'bild';

interface StudioModeDef extends ComposerOption<StudioMode> {
  placeholder?: string;
}

const STUDIO_MODES: readonly StudioModeDef[] = [
  {
    id: 'auto',
    name: 'Auto',
    description: 'Erkennt aus deinem Text, was entstehen soll',
  },
  {
    id: 'sharepic',
    name: 'Sharepic',
    description: 'Sharepic oder Karussell im Grünen-Design, im Editor bearbeitbar',
  },
  {
    id: 'bild',
    name: 'Bild',
    description: 'Neues KI-Bild aus Text – mit hochgeladenem Bild: Bild per Anweisung ändern',
  },
  // „Boxen bearbeiten" is gone until the editor has room for it again (#4364).
];

// Sharepic-specific placeholder rotation (the composer otherwise shows the
// office doc/board/sheet examples). The long examples come from the country's
// Vorlagen; these stand in while the catalogue loads or is not rolled out.
const SHAREPIC_PROMPT_EXAMPLES = [
  'Erstelle ein Sharepic zum Klimaschutz …',
  'Erstelle ein Zitat-Sharepic …',
  'Erstelle ein Sharepic für eine Veranstaltung …',
  'Erstelle eine Infografik zum Radverkehr …',
];
const SHAREPIC_PROMPT_EXAMPLES_SHORT = [
  'Sharepic erstellen …',
  'Zitat-Sharepic …',
  'Veranstaltung …',
  'Infografik …',
];

const IMAGE_RE = /\b(bild|foto|illustration|ki-bild)\b/i;

/** What the text asks for, like the office composer reads „Präsentation" or „Tabelle". */
function detectStudioMode(text: string, hasImage: boolean): StudioMode {
  if (detectDocType(text, true) === 'sharepic') return 'sharepic';
  return hasImage || IMAGE_RE.test(text) ? 'bild' : 'sharepic';
}

/**
 * "/studio" (Bilder & Videos) — the sharepic/graphics landing page, modelled on
 * the office landing pages: a hero with an AI composer (forced to the sharepic
 * kind), the colourful tool strip (Vorlagen / KI-Bilder / Sharepics / Reels),
 * one row of the most popular Vorlagen of every kind, then the studio recents
 * via the shared StudioGallerySections. A written request goes to the
 * Sharepic-Creator; a Grünerator-Vorlage opens as an editable copy via
 * /studio/vorlage/:id.
 */
const CanvasLandingContent = () => {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const featureIndex = useFeatureIndex();
  // The creator speaks both corporate designs, so the composer serves DE and AT.
  const sharepicEnabled = SHOW_SHAREPIC_STUDIO;
  // „Vorlagen" and „KI-Bilder" give way to the two example pills below; Reels stays.
  const visibleCanvasTools = useMemo(
    () =>
      filterWorkplaceTools(CANVAS_TOOLS).filter(
        (t) => t.id !== 'canvas-vorlagen' && t.id !== 'canvas-ki'
      ),
    []
  );

  // The guided tour types its example prompts into the field.
  const [draft, setDraft] = useState<{ id: number; text: string } | undefined>();
  const fillExample = useCallback(
    (text: string) => setDraft((d) => ({ id: (d?.id ?? 0) + 1, text })),
    []
  );

  // Introduce the new Bilder & Videos surface once (like the editor tours).
  useTourAutostart('studio', true, () => {
    void import('../tours/studioTour').then((m) => m.startStudioTour(fillExample));
  });

  const vorlagen = useSharepicVorlagen().data;
  const promptExamples = useMemo(() => {
    const own = (vorlagen ?? []).map((v) => v.chat.prompts[0]!).slice(0, 4);
    return own.length > 0 ? own : SHAREPIC_PROMPT_EXAMPLES;
  }, [vorlagen]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<LandingPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modeId, setModeId] = useState<StudioMode>('auto');
  const picked = STUDIO_MODES.find((m) => m.id === modeId) ?? STUDIO_MODES[0]!;
  // „Bild" works on one image; „Auto" and „Sharepic" take several photos.
  const singleImage = picked.id === 'bild';
  const hasImage = photos.length > 0;
  const labelOf = (def: StudioModeDef) =>
    def.id === 'bild' ? (hasImage ? 'Bild bearbeiten' : 'KI-Bild') : def.name;

  /** The mode a written request runs in: the picked one, or what „Auto" reads from the text. */
  const resolveMode = useCallback(
    (text: string): StudioModeDef => {
      if (picked.id !== 'auto') return picked;
      const id = detectStudioMode(text, photos.length > 0);
      return STUDIO_MODES.find((m) => m.id === id) ?? picked;
    },
    [picked, photos.length]
  );

  const changeMode = useCallback((next: StudioMode) => {
    setModeId(next);
    setPhotoError(null);
    if (next === 'bild') {
      setPhotos((prev) => prev.slice(0, 1));
    }
  }, []);

  const addPhotos = useCallback(
    (files: File[]) => {
      let notice: string | null = null;
      const added: LandingPhoto[] = [];
      for (const file of files) {
        const problem = photoFileProblem(file);
        if (problem) {
          notice = problem;
          continue;
        }
        const limit = singleImage ? 1 : MAX_PHOTOS;
        if (photos.length + added.length >= limit) {
          notice = singleImage
            ? 'Es geht ein Bild – entferne zuerst das andere.'
            : `Mehr als ${MAX_PHOTOS} Fotos gehen nicht – die übrigen fehlen.`;
          break;
        }
        added.push({ id: crypto.randomUUID(), name: file.name, file });
      }
      setPhotoError(notice);
      setPhotos((prev) => [...prev, ...added]);
    },
    [photos.length, singleImage]
  );

  const handleGenerate = useCallback(
    async (_kind: string, prompt: string) => {
      const description = prompt.trim();
      const target = resolveMode(description);
      const image = photos[0]?.file;
      // „Bild" is one mode: the uploaded image decides between editing it and making a new one.
      // „Auto" is resolved by now; reading it as „Sharepic" keeps the types honest.
      const editorMode: BevMode | null =
        target.id === 'bild' ? (image ? 'bearbeiten' : 'erstellen') : null;
      if (!editorMode && !description) return;

      // Content is made in a new tab. It opens right at the click, while the browser still
      // counts it as the user's doing; the page follows once its request is ready.
      const tab = window.open('about:blank', '_blank');
      const open = (path: string, payload: unknown, routerState: unknown) => {
        const url = tab ? tabUrl(path, payload) : null;
        if (tab && url) tab.location.href = url;
        else {
          // Pop-ups or storage blocked: stay in this tab.
          tab?.close();
          void navigate(path, { state: routerState });
        }
      };

      if (editorMode) {
        const mode = editorMode;
        const dataUrl = image ? await fileToDownscaledDataUrl(image).catch(() => null) : null;
        open('/studio/bild', { mode, prompt: description, image: dataUrl ?? undefined }, {
          mode,
          prompt: description,
          image,
        } satisfies BevEntryState);
        return;
      }

      // The creator gets the photos as library URLs with a description, so they are prepared now.
      setBusy(true);
      setPhotoError(null);
      const prepared = await Promise.allSettled(photos.map((p) => preparePhoto(p.file)));
      setBusy(false);
      const failed = prepared.find((r) => r.status === 'rejected');
      if (failed) {
        tab?.close();
        const reason = failed.reason as unknown;
        setPhotoError(reason instanceof Error ? reason.message : 'Upload fehlgeschlagen.');
        return;
      }
      const handoff: FreitextHandoff = {
        prompt: description,
        photos: prepared.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
      };
      open('/studio/freitext', handoff, handoff);
    },
    [navigate, photos, resolveMode]
  );

  return (
    <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('canvas')}>
      <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
        <h1 className="text-center text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif] [text-wrap:balance] max-sm:text-2xl">
          {firstName ? `Dein Studio, ${firstName}` : 'Dein Studio'}
        </h1>

        <div data-tour="studio-composer">
          <DocsComposer
            items={[]}
            templates={[]}
            search={false}
            draft={draft}
            featureIndex={featureIndex}
            isGenerating={busy}
            submitClassName="bg-[#5B4F8F] hover:bg-[#4B4079]"
            sharepicEnabled={sharepicEnabled}
            forcedKind="sharepic"
            importKinds={['photo']}
            placeholder={
              picked.id === 'bild'
                ? hasImage
                  ? 'Was soll geändert werden?'
                  : 'Beschreibe dein Bild …'
                : picked.placeholder
            }
            toolbarSlot={(query) => (
              <span data-tour="studio-mode" className="flex dark:[&_button]:text-grey-300">
                <ComposerOptionPicker
                  options={STUDIO_MODES}
                  value={picked.id}
                  onChange={changeMode}
                  sheetTitle="Was möchtest du machen?"
                  sectionTitle="Modus"
                  ariaLabel="Modus wählen"
                  triggerLabel={
                    picked.id === 'auto' && query
                      ? `Auto · ${labelOf(resolveMode(query))}`
                      : labelOf(picked)
                  }
                />
              </span>
            )}
            promptExamples={promptExamples}
            promptExamplesShort={SHAREPIC_PROMPT_EXAMPLES_SHORT}
            onGenerate={(kind, prompt) => void handleGenerate(kind, prompt)}
            onSelectTemplate={() => {}}
            onImport={() => fileInput.current?.click()}
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple={!singleImage}
          hidden
          onChange={(e) => {
            addPhotos(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        {(photos.length > 0 || photoError) && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
            {photos.map((p) => (
              <span
                key={p.id}
                className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-grey-300 bg-white px-3 py-1 dark:border-grey-600 dark:bg-grey-800"
              >
                <span className="truncate">{p.name}</span>
                <button
                  type="button"
                  aria-label={`${p.name} entfernen`}
                  onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                >
                  <FiX className="size-3.5" />
                </button>
              </span>
            ))}
            {photoError && <span className="text-red-600">{photoError}</span>}
          </div>
        )}
      </div>

      <section className="mb-xl mt-xl" data-tour="studio-tools">
        <div className={OFFICE_PILL_ROW}>
          <OfficeActionPill
            styleKey="canvas"
            icon={HiOutlineSparkles}
            title="Anleitung"
            onClick={() =>
              void import('../tours/studioTour').then((m) => m.startStudioTour(fillExample))
            }
          />
          {visibleCanvasTools.map((tool) => (
            <OfficeTilePill key={tool.id} tool={tool} themeKey="canvas" />
          ))}
        </div>
      </section>

      <PopularVorlagenRow />

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
