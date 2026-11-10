/**
 * What the page picker suggests on a sharepic: the catalogue's Seiten that
 * look like the design (theme, ground colour, photo — `suggestSeiten`), and
 * what a pick does with one.
 *
 * - „Seite hinzufügen" appends the picked Seite as it is, or — „Mit KI
 *   hinzufügen" — lets the host's AI pick one of them and write it as the
 *   design's next page.
 * - „Vorlage ändern" puts the picked Seite in place of the page and keeps the
 *   page's text: the host's AI writes it into the Seite (#4621). A page
 *   without text takes the Seite as it is.
 *
 * One rule for every pick: closing the picker drops what is still running,
 * so a page only changes while the picker is open.
 */
import { useCanvasEditorServices } from '@ggraphic/editor/host-react';
import { useAnnounce } from '@ggraphic/editor/shell';
import {
  SHAREPIC_DECK_TEXT_MAX,
  SHAREPIC_NEXT_SEITE_CANDIDATES_MAX,
  sharepicFormatSchema,
} from '@gruenerator/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isDeckEmpty, joinDeck } from '../../collab/vorlageDeck';
import { buildDeckText, buildPageText } from '../../configs/buildSharepicText';
import { suggestSeiten } from '../../utils/vorlagenRelevance';

import type { VorlagePage } from '../../grueneratorHostServices';
import type { HeterogeneousPage } from '@ggraphic/editor/config';
import type { EditorPagePickerProps } from '@ggraphic/editor/shell';
import type { SharepicBrand, SharepicFormat, SharepicSeite } from '@gruenerator/contracts';

/** As many as fill two rows of the add picker. */
const ADD_COUNT = 8;
/** „Vorlage ändern" is a choice of look: three rows. */
const REPLACE_COUNT = 12;

/** `busyId` while the AI writes a page of its own choosing. */
export const AI_PAGE = 'ki';

const ADD_ERROR = 'Die Seite ließ sich nicht einfügen. Bitte versuche es erneut.';
const AI_ERROR = 'Die KI-Seite ließ sich nicht erstellen. Bitte versuche es erneut.';
const FILL_ERROR = 'Dein Text ließ sich nicht übertragen. Bitte versuche es erneut.';

export const AI_PAGE_STATUS = 'Passende Seite wird erstellt …';
export const FILL_STATUS = 'Dein Text kommt in die neue Seite …';

export interface PageSuggestions {
  heading: string;
  /** The accessible name of a Seite's tile. */
  pickLabel: (titel: string) => string;
  format: SharepicFormat;
  /** Null while the catalogue loads. */
  seiten: SharepicSeite[] | null;
  /** The Seite being placed, or `AI_PAGE`; the picker waits meanwhile. */
  busyId: string | null;
  /** What the AI is doing right now, for the person waiting. */
  status: string | null;
  error: string | null;
  pick: (seite: SharepicSeite) => void;
  /** „Mit KI hinzufügen"; null where there is nothing to continue or no AI. */
  addWithAi: (() => void) | null;
}

interface Options {
  isOpen: boolean;
  mode: 'add' | 'replace';
  pages: readonly HeterogeneousPage[];
  formatId: string | undefined;
  brand: SharepicBrand;
  addPage: EditorPagePickerProps['addPage'];
  onSelectTemplate: EditorPagePickerProps['onSelectTemplate'];
  /** `replace` only: the page being restyled. */
  currentState: Record<string, unknown> | undefined;
  onClose: () => void;
}

/**
 * `suggestions` is null where the picker suggests nothing: no sharepic
 * format, no Vorlagen from the host, or a restyle that would drop text
 * without an AI to carry it. `close` replaces the picker's own: it drops a
 * pick still running.
 */
export function usePageSuggestions({
  isOpen,
  mode,
  pages,
  formatId,
  brand,
  addPage,
  onSelectTemplate,
  currentState,
  onClose,
}: Options): { suggestions: PageSuggestions | null; close: () => void } {
  const { vorlagen } = useCanvasEditorServices();
  const announce = useAnnounce();
  const listSeiten = vorlagen?.listSeiten;
  const composeSeite = vorlagen?.composeSeite;
  const draftNextSeite = vorlagen?.draftNextSeite;
  const fillSeite = vorlagen?.fillSeite;
  const parsed = sharepicFormatSchema.safeParse(formatId);
  const format = parsed.success ? parsed.data : null;
  const replacing = mode === 'replace';
  const pageText = replacing ? buildPageText(currentState ?? {}) : '';
  const canPlace = replacing ? !pageText || !!fillSeite : !!addPage;
  const active = !!format && !!listSeiten && !!composeSeite && canPlace;

  const [catalogue, setCatalogue] = useState<{
    brand: SharepicBrand;
    seiten: SharepicSeite[];
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Each pick gets a number; closing the picker moves it on, so a pick that
  // finishes after that has nothing to apply to.
  const runRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !active || !listSeiten) return;
    let live = true;
    listSeiten(brand).then(
      (seiten) => {
        if (live) setCatalogue({ brand, seiten });
      },
      (err: unknown) => {
        // Without the catalogue the picker is what it was: blank page and duplicate.
        console.warn('[pageSuggestions] loading the Seiten failed', err);
      }
    );
    return () => {
      live = false;
    };
  }, [isOpen, active, listSeiten, brand]);

  // A restyle may give the page a new beginning; an added page follows one.
  const titles = replacing || isDeckEmpty(pages);
  const ranked = useMemo(
    () =>
      catalogue && catalogue.brand === brand && format
        ? suggestSeiten(catalogue.seiten, format, pages, {
            count: Math.max(REPLACE_COUNT, SHAREPIC_NEXT_SEITE_CANDIDATES_MAX),
            titles,
          })
        : null,
    [catalogue, brand, format, pages, titles]
  );

  const close = () => {
    runRef.current += 1;
    setBusyId(null);
    setStatus(null);
    setError(null);
    onClose();
  };

  if (!active || !format || !composeSeite) return { suggestions: null, close };

  /** Runs one pick; a failure says `failure`, a pick the picker outlived does nothing. */
  const run = (id: string, failure: string, work: (isLive: () => boolean) => Promise<void>) => {
    if (busyId !== null) return;
    const own = ++runRef.current;
    const isLive = () => own === runRef.current;
    setBusyId(id);
    setError(null);
    void work(isLive)
      .catch((err: unknown) => {
        console.warn('[pageSuggestions] the pick failed', err);
        if (isLive()) setError(failure);
      })
      .finally(() => {
        if (isLive()) {
          setBusyId(null);
          setStatus(null);
        }
      });
  };

  const firstPage = (composed: VorlagePage[]): VorlagePage => {
    const [page] = composed;
    if (!page) throw new Error('composed no page');
    return page;
  };

  // `addPage` appends: the page joins the carousel the deck ends with.
  const append = async (page: VorlagePage) => {
    const joined = joinDeck(pages[pages.length - 1] ?? null, page);
    await addPage?.(joined.configId, false, joined.state);
  };

  const pickToAdd = (seite: SharepicSeite) =>
    run(seite.id, ADD_ERROR, async (isLive) => {
      const page = firstPage(await composeSeite(seite, format));
      if (!isLive()) return;
      await append(page);
      if (isLive()) close();
    });

  const pickToRestyle = (seite: SharepicSeite) =>
    run(seite.id, pageText ? FILL_ERROR : ADD_ERROR, async (isLive) => {
      if (pageText) {
        setStatus(FILL_STATUS);
        announce(FILL_STATUS);
      }
      const composed =
        pageText && fillSeite
          ? await fillSeite(seite, format, pageText.slice(0, SHAREPIC_DECK_TEXT_MAX))
          : await composeSeite(seite, format);
      const page = firstPage(composed);
      if (!isLive()) return;
      // The restyled page stays in its carousel.
      const joined = joinDeck(currentState ? { state: currentState } : null, page);
      onSelectTemplate(joined.configId, joined.state);
      announce(
        pageText
          ? `Seite umgestaltet: ${seite.titel}. Dein Text ist geblieben.`
          : `Seite ersetzt: ${seite.titel}`
      );
      close();
    });

  const deckText = replacing ? '' : buildDeckText(pages, SHAREPIC_DECK_TEXT_MAX);
  const addWithAi =
    !replacing && draftNextSeite && addPage && deckText && ranked && ranked.length > 0
      ? () =>
          run(AI_PAGE, AI_ERROR, async (isLive) => {
            setStatus(AI_PAGE_STATUS);
            announce(AI_PAGE_STATUS);
            const { pages: composed } = await draftNextSeite({
              candidates: ranked.slice(0, SHAREPIC_NEXT_SEITE_CANDIDATES_MAX),
              deck: deckText,
              format,
              brand,
            });
            const page = firstPage(composed);
            if (!isLive()) return;
            await append(page);
            if (isLive()) close();
          })
      : null;

  return {
    suggestions: {
      heading: pageText ? 'Seite umgestalten – dein Text bleibt' : 'Passende Vorlagen',
      pickLabel: replacing
        ? (titel) => `Seite „${titel}“ übernehmen`
        : (titel) => `Seite „${titel}“ hinzufügen`,
      format,
      seiten: ranked && ranked.slice(0, replacing ? REPLACE_COUNT : ADD_COUNT),
      busyId,
      status,
      error,
      pick: replacing ? pickToRestyle : pickToAdd,
      addWithAi,
    },
    close,
  };
}
