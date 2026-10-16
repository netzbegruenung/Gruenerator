/**
 * „Vorlagen" tab (Canva's template panel).
 *
 * A sharepic is built from single Seiten: a click adds one after the open
 * page, a tile dragged onto a page adds it after that page, and nothing is
 * replaced or asked. A Vorlage's slides come as Seiten of their own and stay
 * together in their order; the ones most like the design come first.
 *
 * A print design is one sheet set, so its Vorlagen stay whole: a pick lands on
 * an empty design straight away; on one with content it asks first — open the
 * Vorlage as a new design, or replace this design with it (one undo step,
 * offered back through the top bar banner).
 */
import {
  sharepicFormatSchema,
  sharepicSeiteThumbPath,
  type SharepicFormat,
  type SharepicSeite,
  type SharepicSeiteTyp,
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
import { rankVorlagen } from '../../utils/vorlagenRelevance';

import { GalleryTabs } from './StudioGallery';

import type {
  CanvasSpecEditBridge,
  CanvasVorlagenService,
  VorlagePage,
} from '../../CanvasEditorProvider';
import type { HeterogeneousPage } from '../../configs/types';

/** Lets the editor hand a tile dropped on a page to the tab. */
export interface VorlagenSectionHandle {
  /** A Seite goes in after `pageId`; a print Vorlage applies like a click on its tile. */
  drop: (id: string, pageId: string) => void;
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
  /** False once the design holds as many pages as it may. */
  canAddPage: boolean;
}

/** One print Vorlage tile. */
interface VorlageCard {
  id: string;
  titel: string;
  beschreibung: string;
  thumb: string;
  seiten: number;
  compose: () => Promise<VorlagePage[]>;
  /** Null where the host cannot open a new design. */
  openAsNew: (() => void) | null;
}

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

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

/** A Seite in the grid, with its place among the slides of its Vorlage. */
interface SeiteTile {
  seite: SharepicSeite;
  n: number;
  of: number;
}

/**
 * The Seiten of the format. The slides of one Vorlage stay together in their
 * order and are ranked as one, the ones most like the design first; groups of
 * closing slides only go last.
 */
function seitenFor(
  seiten: readonly SharepicSeite[],
  format: SharepicFormat,
  pages: readonly HeterogeneousPage[],
  empty: boolean
): SeiteTile[] {
  const groups = new Map<string, SharepicSeite[]>();
  for (const seite of seiten) {
    if (!seite.formats.includes(format)) continue;
    const key = seite.quelle ? `vorlage:${seite.quelle.vorlage}` : `seite:${seite.id}`;
    const group = groups.get(key);
    if (group) group.push(seite);
    else groups.set(key, [seite]);
  }
  const entries = [...groups.values()].map((group) => {
    group.sort((a, b) => (a.quelle?.seite ?? 0) - (b.quelle?.seite ?? 0));
    return { group, spec: { format, slides: group.map((s) => s.slide) } };
  });
  const ranked = empty ? entries : rankVorlagen(entries, pages);
  const closing = ({ group }: (typeof entries)[number]) =>
    group.every((s) => s.rolle === 'schluss');
  return [...ranked.filter((e) => !closing(e)), ...ranked.filter(closing)].flatMap(({ group }) =>
    group.map((seite, i) => ({ seite, n: i + 1, of: group.length }))
  );
}

/** Drag a tile onto a page, with its preview as the drag image. */
function startDrag(e: DragEvent<HTMLElement>, id: string) {
  e.dataTransfer.setData(VORLAGE_DRAG_TYPE, id);
  e.dataTransfer.effectAllowed = 'copy';
  const preview =
    e.currentTarget.querySelector('img') ?? e.currentTarget.parentElement?.querySelector('img');
  if (preview) {
    e.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);
  }
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

/** A print Vorlage tile; the pick button covers the image. */
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
  return (
    <li className="flex flex-col gap-1">
      <span className={cn('group', TILE_IMAGE, aspect)} style={aspectStyle}>
        <img
          src={vorlage.thumb}
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
          onDragStart={(e) => startDrag(e, vorlage.id)}
          className={cn(TILE_OVERLAY, canDrag && 'active:cursor-grabbing')}
        />
        {vorlage.seiten > 1 && <span className={BADGE}>{vorlage.seiten} Seiten</span>}
        {busy && <Spinner />}
      </span>
      <span className={TILE_TITLE}>{vorlage.titel}</span>
    </li>
  );
}

export function VorlagenSection({
  ref,
  formatId,
  pages,
  deck,
  onShowPage,
  canAddPage,
}: VorlagenSectionProps) {
  const { vorlagen: service, userLocale = 'de-DE' } = useCanvasEditorServices();
  const canDrag = !useIsCanvasMobile();
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  // Ranked against the design as it was when the tab opened: a pick must not
  // reshuffle the grid under the pointer.
  const [atOpen] = useState(() => ({ pages, empty: isDeckEmpty(pages) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<VorlageCard | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [seitenLoad, setSeitenLoad] = useState<Load<SeiteTile>>({ status: 'loading' });
  const [seitenAttempt, setSeitenAttempt] = useState(0);
  const [typ, setTyp] = useState<SharepicSeiteTyp | 'alle'>('alle');

  const format = getCanvasFormat(formatId);
  const printFormat = format && isPrintFormat(format) ? format : null;
  const sharepicFormat = sharepicFormatSchema.safeParse(formatId);
  const seitenFormat = sharepicFormat.success ? sharepicFormat.data : null;
  const listSeiten = service?.listSeiten;
  const composeSeite = service?.composeSeite;

  useEffect(() => {
    if (!listSeiten || !seitenFormat) return;
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
  }, [listSeiten, seitenFormat, seitenAttempt, atOpen]);

  // One print Vorlage per format and country, shipped with the package: nothing to load or rank.
  const printCards =
    printFormat && service
      ? printVorlagenFor(userLocale)
          .filter((v) => v.spec.format === printFormat.id)
          .map((v) => printCard(v, printFormat, service))
      : [];

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

  // An empty design swaps its blank page for the Seite, so it always has room.
  const full = !canAddPage && !isDeckEmpty(pages);

  const addSeite = async (seite: SharepicSeite, afterPageId: string | null) => {
    if (busyId !== null || full || !composeSeite || !seitenFormat) return;
    setBusyId(seite.id);
    setApplyError(null);
    try {
      const [page] = await composeSeite(seite, seitenFormat);
      if (!page) throw new Error('composed no page');
      const ops = seiteDeckOps(deck.getPages(), afterPageId, page, uuid);
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
    drop: (id, pageId) => {
      const vorlage = printCards.find((v) => v.id === id);
      if (vorlage) {
        choose(vorlage);
        return;
      }
      const tile =
        seitenLoad.status === 'ready' ? seitenLoad.items.find((t) => t.seite.id === id) : null;
      if (tile) void addSeite(tile.seite, pageId);
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

  const printView =
    printCards.length === 0 ? (
      <p className={HINT}>Für dieses Format gibt es noch keine Vorlagen.</p>
    ) : (
      <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
        {printCards.map((vorlage) => (
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
      return <p className={HINT}>Für dieses Format gibt es noch keine Seiten.</p>;
    }
    const typen = (Object.keys(SEITE_TYP_LABEL) as SharepicSeiteTyp[]).filter((t) =>
      seitenLoad.items.some(({ seite }) => seite.typ === t)
    );
    const shown = seitenLoad.items.filter(({ seite }) => typ === 'alle' || seite.typ === typ);
    return (
      <>
        <p className="m-0 text-[12px] text-[var(--editor-text-muted)]">
          {full
            ? 'Mehr Seiten passen nicht in dieses Design. Lösche eine, um eine neue einzufügen.'
            : canDrag
              ? 'Ein Klick fügt die Seite hinter der aktuellen ein. Auf eine Seite gezogen, landet sie dahinter.'
              : 'Ein Klick fügt die Seite hinter der aktuellen ein.'}
        </p>
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
          {shown.map(({ seite, n, of }) => {
            const disabled = busyId !== null || full;
            return (
              <li key={seite.id}>
                <button
                  type="button"
                  aria-label={
                    of > 1
                      ? `Seite ${n} von ${of} aus „${seite.titel}“ einfügen`
                      : `Seite „${seite.titel}“ einfügen`
                  }
                  aria-busy={busyId === seite.id}
                  disabled={disabled}
                  onClick={() => void addSeite(seite, deck.getActivePageId())}
                  draggable={canDrag && !disabled}
                  onDragStart={(e) => startDrag(e, seite.id)}
                  className={cn(TILE_BUTTON, canDrag && 'active:cursor-grabbing')}
                >
                  <span className={cn(TILE_IMAGE, aspect)}>
                    <img
                      src={sharepicSeiteThumbPath(seite.id, seitenFormat, seite.thumbVersion)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-150 hover:scale-[1.02]"
                    />
                    {of > 1 && (
                      <span className={BADGE}>
                        {n}/{of}
                      </span>
                    )}
                    {busyId === seite.id && <Spinner />}
                  </span>
                  <span className={TILE_TITLE}>{seite.titel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  })();

  return (
    <div className="flex w-full flex-col gap-2.5">
      {errorLine}
      {printFormat ? printView : seitenView}

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage „{asking?.titel}“ verwenden?</AlertDialogTitle>
            <AlertDialogDescription>
              {asking?.openAsNew
                ? 'Auf deinem Design ist schon etwas. Öffne die Vorlage als neues Design oder ersetze dein aktuelles Design damit.'
                : 'Die Vorlage ersetzt dein aktuelles Design. Rückgängig geht danach über „Vorlage verwerfen“.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            {asking?.openAsNew && (
              <Button variant="outline" onClick={confirmNew}>
                Als neues Design öffnen
              </Button>
            )}
            <AlertDialogAction onClick={confirmReplace}>Aktuelles ersetzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
