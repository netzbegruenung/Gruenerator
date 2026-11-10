/**
 * The Grünerator's part of the editor shell: the „Vorlagen" tab and, around
 * the editor, its blocks and the idle warm-ups of the Elemente and Tools tabs;
 * the page picker with the slider variants and the CD slide layouts; the
 * host callbacks each template declares; and a deck's country (fonts). The shell (`./index.tsx`) imports this file for its side
 * effect, so every program that renders the editor has them installed.
 */
import {
  registerEditorShell,
  type EditorPagePickerProps,
  type EditorShellProviderProps,
  type EditorTabSectionProps,
} from '@ggraphic/editor/shell';
import { useCallback } from 'react';

import { CREATOR_CONFIGS } from '../../collab/sharepicSource';
import { HOST_CALLBACK_KEYS } from '../../hostCallbackKeys';
import { usePreloadElements, usePreloadTools } from '../../sidebar/sections/preloadElements';
import { VorlagenSection } from '../../sidebar/sections/VorlagenSection';
import {
  buildSlideLayout,
  slideLayoutConfigId,
  type SlideLayoutId,
} from '../../slides/slideLayouts';
import { getCategoryForTemplate } from '../../utils/templateRegistry';
import { PagePickerSeiten } from '../PagePickerSeiten';
import { TemplatePickerFlyout } from '../TemplatePickerFlyout';

import { BlockInsertProvider } from './blockInsert';
import { AI_PAGE, usePageSuggestions } from './pageSuggestions';
import { formatHasVorlagen, vorlagenTab, vorlagenTabIndex } from './vorlagenTab';

import type { CanvasConfigId } from '../../templates/registry';
import type { HeterogeneousPage } from '@ggraphic/editor/config';
import type { SharepicBrand } from '@gruenerator/contracts';

/** A deck's brand follows its first page: the slide layouts and fonts of that country. */
const deckLocaleOf = (pages: readonly HeterogeneousPage[]): 'de-DE' | 'de-AT' =>
  pages[0]?.configId === 'freeform-at' || pages[0]?.configId === 'freeform-gj-at'
    ? 'de-AT'
    : 'de-DE';

const isSliderDeck = (pages: readonly HeterogeneousPage[]) =>
  pages[0]?.configId === 'slider' || pages[0]?.configId === 'slider-at';

/** A design of freeform pages: the picker has Seiten for it on a sharepic format. */
const isFreeformDeck = (pages: readonly HeterogeneousPage[]) =>
  pages.length > 0 && pages.every((p) => CREATOR_CONFIGS.includes(p.configId));

const deckBrandOf = (pages: readonly HeterogeneousPage[]): SharepicBrand =>
  pages[0]?.configId === 'freeform-gj' || pages[0]?.configId === 'freeform-gj-at'
    ? 'gruene-jugend'
    : 'gruene';

function GrueneratorVorlagenSection(props: EditorTabSectionProps) {
  // A deck takes the slide layouts of its first page's country, a sharepic the Seiten of its design.
  return (
    <VorlagenSection
      {...props}
      layoutLocale={deckLocaleOf(props.pages)}
      brand={deckBrandOf(props.pages)}
    />
  );
}

function GrueneratorEditorProvider({
  configTabIds,
  children,
  ...blocks
}: EditorShellProviderProps) {
  usePreloadElements(configTabIds.some((id) => id === 'elements' || id === 'assets'));
  usePreloadTools(configTabIds.includes('tools'));
  return <BlockInsertProvider {...blocks}>{children}</BlockInsertProvider>;
}

/** The template picker: the country's templates, slider variants and slide layouts. */
function GrueneratorPagePicker({
  pages,
  currentTemplateId,
  activeTemplateId,
  addPage,
  mode,
  ...flyout
}: EditorPagePickerProps) {
  // Boundary: page config ids are persisted strings; unknown ones fail when their config loads.
  const current = currentTemplateId as CanvasConfigId | undefined;
  const active = activeTemplateId as CanvasConfigId | undefined;
  const deckConfigId = pages[0]?.configId;

  // Add a slider variant page (cover, content, or last) in the deck's own brand
  const handleAddSliderVariant = useCallback(
    async (variant: 'cover' | 'content' | 'last') => {
      const overrides: Record<string, unknown> = { slideVariant: variant };
      if (variant === 'last') {
        overrides.headline = '';
        overrides.subtext = '';
        overrides.label = '';
      }
      await addPage?.(deckConfigId === 'slider-at' ? 'slider-at' : 'slider', true, overrides);
    },
    [addPage, deckConfigId]
  );

  // Präsentation: eine Folie aus den CD-Layouts anhängen, im CI des Decks.
  // Kein Hintergrund von der aktuellen Seite: das Layout bringt seinen eigenen.
  const layoutLocale = deckLocaleOf(pages);
  const pageCount = pages.length;
  const handleAddSlideLayout = useCallback(
    async (layoutId: SlideLayoutId) => {
      const state = buildSlideLayout(layoutId, {
        locale: layoutLocale,
        pageNumber: pageCount + 1,
        date: new Date(),
      });
      await addPage?.(slideLayoutConfigId(layoutLocale), false, state);
    },
    [addPage, layoutLocale, pageCount]
  );

  // „Leere Seite": the add picker offers only blank pages. They stay in the
  // deck's brand but don't take the current page's photo or colour (#5256).
  const handleAddBlankPage = useCallback(
    (configId: string) => {
      void addPage?.(configId, { brand: true, background: false });
    },
    [addPage]
  );

  // Sharepic: the catalogue's Seiten that look like the design come first.
  const { suggestions, close } = usePageSuggestions({
    isOpen: flyout.isOpen,
    mode,
    pages,
    formatId: flyout.formatId,
    brand: deckBrandOf(pages),
    addPage,
    onSelectTemplate: flyout.onSelectTemplate,
    currentState: flyout.currentState,
    onClose: flyout.onClose,
  });
  const busy = (suggestions?.busyId ?? null) !== null;

  const isAdd = mode === 'add';
  return (
    <TemplatePickerFlyout
      {...flyout}
      onClose={close}
      suggestions={
        suggestions && (
          <>
            <PagePickerSeiten
              heading={suggestions.heading}
              seiten={suggestions.seiten}
              format={suggestions.format}
              busyId={suggestions.busyId}
              disabled={busy}
              pickLabel={suggestions.pickLabel}
              onPick={suggestions.pick}
            />
            {suggestions.status && suggestions.busyId !== AI_PAGE && (
              <p className="m-0 mb-3 text-[13px] text-foreground-muted">{suggestions.status}</p>
            )}
            {suggestions.error && (
              <p role="alert" className="m-0 mb-3 text-[13px] text-[var(--editor-danger-fg)]">
                {suggestions.error}
              </p>
            )}
          </>
        )
      }
      onAddWithAi={suggestions?.addWithAi ?? undefined}
      aiStatus={suggestions?.busyId === AI_PAGE ? suggestions.status : null}
      busy={busy}
      onSelectTemplate={isAdd && addPage ? handleAddBlankPage : flyout.onSelectTemplate}
      mode={mode}
      currentTemplateId={current}
      onAddSliderVariant={isAdd && isSliderDeck(pages) ? handleAddSliderVariant : undefined}
      // Restrict the template picker to the same category as the active template
      // (sharepic, slider, presentation, plakat, profilbild) so e.g. a Zitat page
      // can't insert a presentation slide.
      templateFilter={active ? getCategoryForTemplate(active) : undefined}
      onAddSlideLayout={isAdd ? handleAddSlideLayout : undefined}
    />
  );
}

registerEditorShell({
  tabs: [
    {
      tab: vorlagenTab,
      insertAt: vorlagenTabIndex,
      // The Vorlagen tab changes the deck, so it needs the synced pages doc (the shell checks it).
      isAvailable: ({ services, formatId }) =>
        services.vorlagen !== undefined && formatHasVorlagen(formatId),
      takesPageDrops: true,
      Section: GrueneratorVorlagenSection,
    },
  ],
  Provider: GrueneratorEditorProvider,
  pagePicker: {
    Picker: GrueneratorPagePicker,
    // Slider decks have no sensible single "quick add" — a page is explicitly a
    // Start (green pill), Text or Ende slide — so "+" opens the variant picker.
    // A freeform deck's „+" opens it too: that is where the fitting Seiten are.
    quickAddOpensPicker: (pages) => isSliderDeck(pages) || isFreeformDeck(pages),
  },
  // Boundary: a page of an unknown template declares no host callbacks.
  pageCallbackKeys: (configId) =>
    (HOST_CALLBACK_KEYS as Partial<Record<string, readonly string[]>>)[configId] ?? [],
  deckLocale: deckLocaleOf,
});
