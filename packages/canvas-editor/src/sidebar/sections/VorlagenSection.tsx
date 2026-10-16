/**
 * „Vorlagen" tab: the Grünerator-Vorlagen of the design's format, the ones
 * most like the design first (Canva's template panel). A pick — a click, or
 * on desktop a tile dragged onto a page — lands on an empty design straight
 * away; on one with content it asks first — open the Vorlage as a new design, or replace this design with it (one undo step,
 * offered back through the top bar banner).
 *
 * Two catalogues feed the same grid: the sharepic Vorlagen come from the
 * host (`list`/`compose`), the print Vorlagen ship with this package and
 * compose here. Both become a `VorlageCard` that knows how to compose and
 * open itself, so picking, asking and replacing are one code path.
 *
 * Beside the whole Vorlagen, „Seiten" offers single slides to build a
 * carousel from: a pick adds the slide after the open page, nothing is asked.
 */
import {
  sharepicFormatSchema,
  sharepicSeiteThumbPath,
  sharepicVorlageThumbPath,
  type SharepicFormat,
  type SharepicSeite,
  type SharepicSeiteTyp,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Skeleton,
} from '@gruenerator/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useImperativeHandle,
  useState,
  type CSSProperties,
  type DragEvent,
  type Ref,
} from 'react';
import { v4 as uuid } from 'uuid';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import {
  carryImpressum,
  isDeckEmpty,
  seiteDeckOps,
  vorlageDeckOps,
} from '../../collab/vorlageDeck';
import { composePrint } from '../../composer/composePrint';
import { printVorlagenFor, type PrintVorlage } from '../../composer/printVorlagen';
import { getCanvasFormat, isPrintFormat, type PrintCanvasFormat } from '../../formats';
import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';
import { cn } from '../../utils/cn';
import { ensureFontsReady } from '../../utils/ensureFontsReady';
import { VORLAGE_DRAG_TYPE } from '../../utils/mediaDrop';
import { rankVorlagen, vorlagenForFormat } from '../../utils/vorlagenRelevance';

import { GalleryTabs } from './StudioGallery';

import type {
  CanvasSpecEditBridge,
  CanvasVorlagenService,
  VorlagePage,
} from '../../CanvasEditorProvider';
import type { HeterogeneousPage } from '../../configs/types';

/** Lets the editor hand a Vorlage dropped on a page to the tab. */
export interface VorlagenSectionHandle {
  /** Applies like a click on the tile: asks first on a design with content. */
  pick: (vorlageId: string) => void;
}

export interface VorlagenSectionProps {
  ref?: Ref<VorlagenSectionHandle>;
  formatId: string;
  /** The pages as they are now; the order is taken from the design when the tab opened. */
  pages: readonly HeterogeneousPage[];
  /** Live page reads and the one-step deck change. */
  deck: Pick<CanvasSpecEditBridge, 'getPages' | 'getActivePageId' | 'replaceDeck'>;
  /** Brings a page into view — the one a Seite was just added as. */
  onShowPage?: (pageId: string) => void;
}

/** One tile of the grid, whichever catalogue it comes from. */
interface VorlageCard {
  id: string;
  titel: string;
  beschreibung: string;
  thumb: string;
  /** Preview of a further slide (1-based); null where only the cover has one. */
  thumbAt: ((seite: number) => string) | null;
  seiten: number;
  compose: () => Promise<VorlagePage[]>;
  /** Null where the host cannot open a new design. */
  openAsNew: (() => void) | null;
}

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

function sharepicCard(vorlage: SharepicVorlage, service: CanvasVorlagenService): VorlageCard {
  const { openAsNew } = service;
  return {
    id: vorlage.id,
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    thumb: sharepicVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion),
    thumbAt: (seite) => sharepicVorlageThumbPath(vorlage.id, seite, vorlage.thumbVersion),
    seiten: vorlage.spec.slides.length,
    compose: () => service.compose(vorlage),
    openAsNew: openAsNew ? () => openAsNew(vorlage) : null,
  };
}

function printCard(
  vorlage: PrintVorlage,
  format: PrintCanvasFormat,
  service: CanvasVorlagenService
): VorlageCard {
  const { openPrintAsNew } = service;
  return {
    id: vorlage.id,
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    thumb: vorlage.thumb,
    thumbAt: null,
    seiten: format.print.seiten,
    // Composing measures text in the brand fonts, like the gallery's „Verwenden".
    compose: async () => {
      await ensureFontsReady();
      const composed = composePrint(vorlage.spec);
      return composed.slides.map((state) => ({ configId: composed.templateType, state }));
    },
    openAsNew: openPrintAsNew ? () => openPrintAsNew(vorlage) : null,
  };
}

const SEITE_TYP_LABEL: Record<SharepicSeiteTyp, string> = {
  text: 'Text',
  liste: 'Liste',
  frage: 'Frage',
  zitat: 'Zitat',
  diagramm: 'Diagramm',
  aufruf: 'Aufruf',
};

const ROLLE_ORDER = { titel: 0, inhalt: 1, schluss: 2 } as const;

/** The Seiten of the format, the ones most like the design first, closing slides last. */
function seitenFor(
  seiten: readonly SharepicSeite[],
  format: SharepicFormat,
  pages: readonly HeterogeneousPage[],
  empty: boolean
): SharepicSeite[] {
  const fitting = seiten
    .filter((s) => s.formats.includes(format))
    .map((seite) => ({ seite, spec: { format, slides: [seite.slide] } }));
  const ranked = empty ? fitting : rankVorlagen(fitting, pages);
  return ranked
    .map((entry) => entry.seite)
    .sort((a, b) => ROLLE_ORDER[a.rolle] - ROLLE_ORDER[b.rolle]);
}

const HINT = 'm-0 py-4 text-center text-[13px] text-[var(--editor-text-muted)]';

const SECONDARY_BUTTON =
  'h-9 px-3.5 rounded-lg border-none cursor-pointer bg-[var(--editor-tile)] text-[13px] font-semibold text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:opacity-60 disabled:cursor-not-allowed';

const TILE_BUTTON =
  'flex w-full cursor-pointer flex-col gap-1 rounded-lg border-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:cursor-wait';

const TILE_IMAGE = 'relative block w-full overflow-hidden rounded-lg bg-[var(--editor-tile)]';

/** The pick button over a tile's image; focus shows as a ring inside the tile. */
const TILE_OVERLAY =
  'absolute inset-0 cursor-pointer rounded-lg border-none bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--editor-accent)] disabled:cursor-wait';

const TILE_TITLE = 'line-clamp-2 text-[12px] font-medium leading-tight text-[var(--editor-text)]';

const BADGE =
  'pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-semibold text-white';

const BROWSE_BUTTON =
  'absolute top-1/2 z-[1] flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-black/55 p-0 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:hidden [@media(hover:none)]:opacity-100';

const APPLY_ERROR = 'Die Vorlage ließ sich nicht anwenden. Bitte versuche es erneut.';
const ADD_ERROR = 'Die Seite ließ sich nicht einfügen. Bitte versuche es erneut.';

function Spinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
      <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
    </span>
  );
}

function LoadingGrid({
  aspect,
  aspectStyle,
  label,
}: {
  aspect: string;
  aspectStyle?: CSSProperties;
  label: string;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className={cn('w-full rounded-lg', aspect)} style={aspectStyle} />
      ))}
    </div>
  );
}

function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-2">
      <p className={HINT}>{text}</p>
      <button type="button" className={SECONDARY_BUTTON} onClick={onRetry}>
        Erneut versuchen
      </button>
    </div>
  );
}

/**
 * A Vorlage tile; a carousel's slides can be leafed through before picking
 * it. The pick button covers the image, the arrows sit above it.
 */
function VorlageTile({
  vorlage,
  aspect,
  aspectStyle,
  busy,
  disabled,
  canDrag,
  onPick,
}: {
  vorlage: VorlageCard;
  aspect: string;
  aspectStyle?: CSSProperties;
  busy: boolean;
  disabled: boolean;
  /** Mouse drag onto a page; off on touch layouts, where HTML5 DnD does not fire. */
  canDrag: boolean;
  onPick: () => void;
}) {
  const [shown, setShown] = useState(1);
  const { seiten, thumbAt } = vorlage;
  const browsable = thumbAt !== null && seiten > 1;
  const startDrag = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(VORLAGE_DRAG_TYPE, vorlage.id);
    e.dataTransfer.effectAllowed = 'copy';
    const preview = e.currentTarget.parentElement?.querySelector('img');
    if (preview) {
      e.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);
    }
  };
  return (
    <li className="flex flex-col gap-1">
      <span className={cn('group', TILE_IMAGE, aspect)} style={aspectStyle}>
        <img
          src={browsable && shown > 1 ? thumbAt(shown) : vorlage.thumb}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
        />
        <button
          type="button"
          title={vorlage.beschreibung}
          aria-label={`Vorlage „${vorlage.titel}“ anwenden`}
          aria-busy={busy}
          disabled={disabled}
          onClick={onPick}
          draggable={canDrag && !disabled}
          onDragStart={startDrag}
          className={cn(TILE_OVERLAY, canDrag && 'active:cursor-grabbing')}
        />
        {seiten > 1 && (
          <span className={BADGE}>{browsable ? `${shown}/${seiten}` : `${seiten} Seiten`}</span>
        )}
        {browsable && (
          <>
            <button
              type="button"
              aria-label={`Vorherige Seite von „${vorlage.titel}“`}
              disabled={shown === 1}
              onClick={() => setShown((n) => Math.max(1, n - 1))}
              className={cn(BROWSE_BUTTON, 'left-1')}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Nächste Seite von „${vorlage.titel}“`}
              disabled={shown === seiten}
              onClick={() => setShown((n) => Math.min(seiten, n + 1))}
              className={cn(BROWSE_BUTTON, 'right-1')}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </>
        )}
        {busy && <Spinner />}
      </span>
      <span className={TILE_TITLE}>{vorlage.titel}</span>
    </li>
  );
}

type View = 'vorlagen' | 'seiten';

const VIEWS = [
  { id: 'vorlagen', label: 'Ganze Vorlagen' },
  { id: 'seiten', label: 'Einzelne Seiten' },
] as const;

export function VorlagenSection({ ref, formatId, pages, deck, onShowPage }: VorlagenSectionProps) {
  const { vorlagen: service, userLocale = 'de-DE' } = useCanvasEditorServices();
  const canDrag = !useIsCanvasMobile();
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  const [load, setLoad] = useState<Load<VorlageCard>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Ranked against the design as it was when the tab opened: a pick must not
  // reshuffle the grid under the pointer.
  const [atOpen] = useState(() => ({ pages, empty: isDeckEmpty(pages) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<VorlageCard | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [view, setView] = useState<View>('vorlagen');
  const [seitenLoad, setSeitenLoad] = useState<Load<SharepicSeite>>({ status: 'loading' });
  const [seitenAttempt, setSeitenAttempt] = useState(0);
  const [typ, setTyp] = useState<SharepicSeiteTyp | 'alle'>('alle');

  const format = getCanvasFormat(formatId);
  const printFormat = format && isPrintFormat(format) ? format : null;
  const sharepicFormat = sharepicFormatSchema.safeParse(formatId);
  const seitenFormat = sharepicFormat.success ? sharepicFormat.data : null;
  const listSeiten = service?.listSeiten;
  const composeSeite = service?.composeSeite;
  const offersSeiten = seitenFormat !== null && !!listSeiten && !!composeSeite;

  useEffect(() => {
    if (!service || printFormat) return;
    let live = true;
    service.list().then(
      (vorlagen) => {
        if (!live) return;
        const fitting = vorlagenForFormat(vorlagen, formatId);
        const shown = atOpen.empty ? fitting : rankVorlagen(fitting, atOpen.pages);
        setLoad({ status: 'ready', items: shown.map((v) => sharepicCard(v, service)) });
      },
      (err: unknown) => {
        console.warn('[VorlagenSection] loading the Vorlagen failed', err);
        if (live) setLoad({ status: 'error' });
      }
    );
    return () => {
      live = false;
    };
  }, [service, attempt, printFormat, formatId, atOpen]);

  // The Seiten load once the view is first opened.
  const wantsSeiten = view === 'seiten';
  useEffect(() => {
    if (!wantsSeiten || !listSeiten || !seitenFormat) return;
    let live = true;
    listSeiten().then(
      (seiten) => {
        if (live) {
          setSeitenLoad({
            status: 'ready',
            items: seitenFor(seiten, seitenFormat, atOpen.pages, atOpen.empty),
          });
        }
      },
      (err: unknown) => {
        console.warn('[VorlagenSection] loading the Seiten failed', err);
        if (live) setSeitenLoad({ status: 'error' });
      }
    );
    return () => {
      live = false;
    };
  }, [wantsSeiten, listSeiten, seitenFormat, seitenAttempt, atOpen]);

  // One print Vorlage per format and country, shipped with the package: nothing to load or rank.
  const shownLoad: Load<VorlageCard> =
    printFormat && service
      ? {
          status: 'ready',
          items: printVorlagenFor(userLocale)
            .filter((v) => v.spec.format === printFormat.id)
            .map((v) => printCard(v, printFormat, service)),
        }
      : load;

  const apply = async (vorlage: VorlageCard, replacing: boolean) => {
    setBusyId(vorlage.id);
    setApplyError(null);
    try {
      const current = deck.getPages();
      const next = carryImpressum(current, await vorlage.compose());
      deck.replaceDeck(vorlageDeckOps(current, next, uuid));
      if (replacing) setPending({ title: vorlage.titel, undo: 'pages', source: 'vorlage' });
    } catch (err) {
      console.warn('[VorlagenSection] applying the Vorlage failed', err);
      setApplyError(APPLY_ERROR);
    } finally {
      setBusyId(null);
    }
  };

  const addSeite = async (seite: SharepicSeite) => {
    if (busyId !== null || !composeSeite || !seitenFormat) return;
    setBusyId(seite.id);
    setApplyError(null);
    try {
      const [page] = await composeSeite(seite, seitenFormat);
      if (!page) throw new Error('composed no page');
      const ops = seiteDeckOps(deck.getPages(), deck.getActivePageId(), page, uuid);
      const [inserted] = deck.replaceDeck(ops);
      const shownId = inserted ?? ops.updates[0]?.pageId;
      if (shownId) onShowPage?.(shownId);
    } catch (err) {
      console.warn('[VorlagenSection] adding the Seite failed', err);
      setApplyError(ADD_ERROR);
    } finally {
      setBusyId(null);
    }
  };

  const choose = (vorlage: VorlageCard) => {
    if (busyId !== null) return;
    if (isDeckEmpty(deck.getPages())) void apply(vorlage, false);
    else setAsking(vorlage);
  };

  useImperativeHandle(ref, () => ({
    pick: (vorlageId) => {
      const vorlage =
        shownLoad.status === 'ready' ? shownLoad.items.find((v) => v.id === vorlageId) : null;
      if (vorlage) choose(vorlage);
    },
  }));

  if (!service) return null;

  const confirmReplace = () => {
    const vorlage = asking;
    setAsking(null);
    if (vorlage) void apply(vorlage, true);
  };

  const confirmNew = () => {
    const vorlage = asking;
    setAsking(null);
    vorlage?.openAsNew?.();
  };

  const newLabel = printFormat ? 'Als neues Design öffnen' : 'Als neues Sharepic öffnen';
  const newTarget = printFormat ? 'neues Design' : 'neues Sharepic';

  // A print card shows its sheet as it is; the sharepic grid keeps its classes.
  const aspect = printFormat
    ? ''
    : formatId === 'post-portrait-tall'
      ? 'aspect-[3/4]'
      : 'aspect-[4/5]';
  const aspectStyle = printFormat
    ? { aspectRatio: `${printFormat.width} / ${printFormat.height}` }
    : undefined;

  const errorLine = applyError && (
    <p role="alert" className="m-0 text-[13px] text-[var(--editor-danger-fg)]">
      {applyError}
    </p>
  );

  const vorlagenView = (() => {
    if (shownLoad.status === 'loading') {
      return <LoadingGrid aspect={aspect} aspectStyle={aspectStyle} label="Vorlagen laden" />;
    }
    if (shownLoad.status === 'error') {
      return (
        <LoadError
          text="Vorlagen konnten nicht geladen werden."
          onRetry={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      );
    }
    if (shownLoad.items.length === 0) {
      return <p className={HINT}>Für dieses Format gibt es noch keine Vorlagen.</p>;
    }
    return (
      <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
        {shownLoad.items.map((vorlage) => (
          <VorlageTile
            key={vorlage.id}
            vorlage={vorlage}
            aspect={aspect}
            aspectStyle={aspectStyle}
            busy={busyId === vorlage.id}
            disabled={busyId !== null}
            canDrag={canDrag}
            onPick={() => choose(vorlage)}
          />
        ))}
      </ul>
    );
  })();

  const seitenView = (() => {
    if (!seitenFormat) return null;
    if (seitenLoad.status === 'loading') {
      return <LoadingGrid aspect={aspect} label="Seiten laden" />;
    }
    if (seitenLoad.status === 'error') {
      return (
        <LoadError
          text="Seiten konnten nicht geladen werden."
          onRetry={() => {
            setSeitenLoad({ status: 'loading' });
            setSeitenAttempt((n) => n + 1);
          }}
        />
      );
    }
    if (seitenLoad.items.length === 0) {
      return <p className={HINT}>Für dieses Format gibt es noch keine einzelnen Seiten.</p>;
    }
    const typen = (Object.keys(SEITE_TYP_LABEL) as SharepicSeiteTyp[]).filter((t) =>
      seitenLoad.items.some((s) => s.typ === t)
    );
    const shown = seitenLoad.items.filter((s) => typ === 'alle' || s.typ === typ);
    return (
      <>
        {typen.length > 1 && (
          <GalleryTabs
            label="Art der Seite"
            tabs={[
              { id: 'alle' as const, label: 'Alle' },
              ...typen.map((t) => ({ id: t, label: SEITE_TYP_LABEL[t] })),
            ]}
            value={typ}
            onChange={setTyp}
          />
        )}
        <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
          {shown.map((seite) => (
            <li key={seite.id}>
              <button
                type="button"
                aria-label={`Seite „${seite.titel}“ einfügen`}
                aria-busy={busyId === seite.id}
                disabled={busyId !== null}
                onClick={() => void addSeite(seite)}
                className={TILE_BUTTON}
              >
                <span className={cn(TILE_IMAGE, aspect)}>
                  <img
                    src={sharepicSeiteThumbPath(seite.id, seitenFormat, seite.thumbVersion)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-150 hover:scale-[1.02]"
                  />
                  {busyId === seite.id && <Spinner />}
                </span>
                <span className={TILE_TITLE}>{seite.titel}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  })();

  return (
    <div className="flex w-full flex-col gap-2.5">
      {offersSeiten && (
        <GalleryTabs label="Vorlagen oder Seiten" tabs={VIEWS} value={view} onChange={setView} />
      )}
      {offersSeiten && view === 'seiten' && (
        <p className="m-0 text-[12px] text-[var(--editor-text-muted)]">
          Ein Klick fügt die Seite hinter der aktuellen ein.
        </p>
      )}
      {errorLine}
      {view === 'seiten' && offersSeiten ? seitenView : vorlagenView}

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage „{asking?.titel}“ verwenden?</AlertDialogTitle>
            <AlertDialogDescription>
              {asking?.openAsNew
                ? `Auf deinem Design ist schon etwas. Öffne die Vorlage als ${newTarget} oder ersetze dein aktuelles Design damit.`
                : 'Die Vorlage ersetzt dein aktuelles Design. Rückgängig geht danach über „Vorlage verwerfen“.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            {asking?.openAsNew && (
              <Button variant="outline" onClick={confirmNew}>
                {newLabel}
              </Button>
            )}
            <AlertDialogAction onClick={confirmReplace}>Aktuelles ersetzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
