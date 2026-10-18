/**
 * „Vorlagen" tab (Canva's template panel).
 *
 * A sharepic is built from single Seiten: a click adds one after the open
 * page, a tile dragged onto a page adds it after that page, and nothing is
 * replaced or asked. A Vorlage's slides come as Seiten of their own and stay
 * together in their order; the ones most like the design come first.
 *
 * Every other format shows the Vorlagen of exactly its size, both from the
 * host: the print Vorlagen (`listPrint`), whose specs compose here
 * (`composePrint`), and the canvas Vorlagen — finished pages such as the
 * stickers (`listCanvas`). A print Vorlage of several pages comes as one tile
 * per page, so the sides of different Vorlagen mix: such a tile takes the
 * place of the open page, or of the page it is dragged onto. A pick lands on
 * an empty design (or page) straight away — a page tile brings its whole
 * Vorlage there; on content it asks first — open the Vorlage as a new design,
 * or replace with it (one undo step, offered back through the top bar banner).
 */
import {
  canvasVorlageThumbPath,
  printVorlageThumbPath,
  sharepicFormatSchema,
  sharepicSeiteThumbPath,
  type CanvasVorlage,
  type PrintVorlage,
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
  pageSwapOps,
  seiteDeckOps,
  vorlageDeckOps,
} from '../../collab/vorlageDeck';
import { composePrint } from '../../composer/composePrint';
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
  /** A Seite goes in after `pageId`; a Vorlage page takes its place; a whole Vorlage applies. */
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

/** A Vorlage tile, print or canvas: the whole Vorlage, or one page of a print Vorlage. */
interface VorlageCard {
  id: string;
  titel: string;
  beschreibung: string;
  thumb: string;
  /** All the Vorlage's pages; a page tile picks its own from them. */
  compose: () => Promise<VorlagePage[]>;
  /** Null where the host cannot open a new design. */
  openAsNew: (() => void) | null;
  /** The page a page tile stands for; null on a whole-Vorlage tile. */
  seite: { n: number; of: number } | null;
}

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

/** A one-page print Vorlage as one tile; one of several pages as a tile each. */
function printCards(
  vorlage: PrintVorlage,
  format: PrintCanvasFormat,
  openPrintAsNew: CanvasVorlagenService['openPrintAsNew']
): VorlageCard[] {
  const of = format.print.seiten;
  // Composing measures text in the brand fonts, like the gallery's „Verwenden".
  const compose = async () => {
    await ensureFontsReady();
    const composed = composePrint(vorlage.spec);
    return composed.slides.map((state) => ({ configId: composed.templateType, state }));
  };
  const openAsNew = openPrintAsNew ? () => openPrintAsNew(vorlage) : null;
  return Array.from({ length: of }, (_, i) => ({
    id: of > 1 ? `${vorlage.id}#${i + 1}` : vorlage.id,
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    thumb: printVorlageThumbPath(vorlage.id, i + 1, vorlage.thumbVersion),
    compose,
    openAsNew,
    seite: of > 1 ? { n: i + 1, of } : null,
  }));
}

function canvasCard(vorlage: CanvasVorlage): VorlageCard {
  return {
    id: vorlage.id,
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    thumb: canvasVorlageThumbPath(vorlage.id, vorlage.thumbVersion),
    // The pages are finished already; a copy, so the cached catalogue stays untouched.
    compose: () =>
      Promise.resolve(
        vorlage.pages.map((page) => ({
          configId: page.configId,
          state: structuredClone(page.state),
        }))
      ),
    openAsNew: null,
    seite: null,
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

/** A whole-Vorlage tile; the pick button covers the image. */
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
  // A preview that failed to load (none exported yet) leaves the tile plain, not a broken image.
  const [broken, setBroken] = useState(false);
  return (
    <li className="flex flex-col gap-1">
      <span className={cn('group', TILE_IMAGE, aspect)} style={aspectStyle}>
        {broken ? null : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError ist ein technischer Ladefehler-Fallback, keine Bedienung
          <img
            src={vorlage.thumb}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
          />
        )}
        <button
          type="button"
          title={vorlage.beschreibung}
          aria-label={
            vorlage.seite
              ? `Seite ${vorlage.seite.n} von ${vorlage.seite.of} aus „${vorlage.titel}“ übernehmen`
              : `Vorlage „${vorlage.titel}“ anwenden`
          }
          aria-busy={busy}
          disabled={disabled}
          onClick={onPick}
          draggable={canDrag && !disabled}
          onDragStart={(e) => startDrag(e, vorlage.id)}
          className={cn(TILE_OVERLAY, canDrag && 'active:cursor-grabbing')}
        />
        {vorlage.seite && (
          <span className={BADGE}>
            {vorlage.seite.n}/{vorlage.seite.of}
          </span>
        )}
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
  const { vorlagen: service } = useCanvasEditorServices();
  const canDrag = !useIsCanvasMobile();
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  // Ranked against the design as it was when the tab opened: a pick must not
  // reshuffle the grid under the pointer.
  const [atOpen] = useState(() => ({ pages, empty: isDeckEmpty(pages) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ card: VorlageCard; pageId: string | null } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [seitenLoad, setSeitenLoad] = useState<Load<SeiteTile>>({ status: 'loading' });
  const [seitenAttempt, setSeitenAttempt] = useState(0);
  const [typ, setTyp] = useState<SharepicSeiteTyp | 'alle'>('alle');
  const [wholeLoad, setWholeLoad] = useState<Load<VorlageCard>>({ status: 'loading' });
  const [wholeAttempt, setWholeAttempt] = useState(0);

  const format = getCanvasFormat(formatId);
  const printFormat = format && isPrintFormat(format) ? format : null;
  const sharepicFormat = sharepicFormatSchema.safeParse(formatId);
  const seitenFormat = sharepicFormat.success ? sharepicFormat.data : null;
  const listSeiten = service?.listSeiten;
  const composeSeite = service?.composeSeite;
  const listCanvas = service?.listCanvas;
  const listPrint = service?.listPrint;
  const openPrintAsNew = service?.openPrintAsNew;

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

  // Sharepic formats are built from Seiten; every other format gets its whole Vorlagen.
  useEffect(() => {
    if (seitenFormat) return;
    let live = true;
    // On a print format the print Vorlagen of the format come first.
    const print: Promise<VorlageCard[]> =
      printFormat && listPrint
        ? listPrint().then((vorlagen) =>
            vorlagen
              .filter((v) => v.spec.format === printFormat.id)
              .flatMap((v) => printCards(v, printFormat, openPrintAsNew))
          )
        : Promise.resolve([]);
    const canvas: Promise<VorlageCard[]> = listCanvas
      ? listCanvas().then((vorlagen) =>
          vorlagen.filter((v) => v.format === formatId).map(canvasCard)
        )
      : Promise.resolve([]);
    Promise.all([print, canvas]).then(
      ([fromPrint, fromPages]) => {
        if (live) setWholeLoad({ status: 'ready', items: [...fromPrint, ...fromPages] });
      },
      (err: unknown) => {
        console.warn('[VorlagenSection] loading the Vorlagen failed', err);
        if (live) setWholeLoad({ status: 'error' });
      }
    );
    return () => {
      live = false;
    };
  }, [listPrint, listCanvas, openPrintAsNew, seitenFormat, printFormat, formatId, wholeAttempt]);

  const wholeCards = wholeLoad.status === 'ready' ? wholeLoad.items : [];

  const apply = async (vorlage: VorlageCard, pageId: string | null, replacing: boolean) => {
    setBusyId(vorlage.id);
    setApplyError(null);
    try {
      const current = deck.getPages();
      const next = carryImpressum(current, await vorlage.compose());
      const { seite } = vorlage;
      if (seite && !isDeckEmpty(current)) {
        const page = next[seite.n - 1];
        if (!page) throw new Error('composed no such page');
        const ops = pageSwapOps(current, pageId, page, uuid);
        const [inserted] = deck.replaceDeck(ops);
        const shownId = inserted ?? ops.updates[0]?.pageId;
        if (shownId) onShowPage?.(shownId);
      } else {
        deck.replaceDeck(vorlageDeckOps(current, next, uuid));
        const shownId = seite ? deck.getPages()[seite.n - 1]?.id : null;
        if (shownId) onShowPage?.(shownId);
      }
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

  const choose = (vorlage: VorlageCard, pageId: string | null) => {
    if (busyId !== null) return;
    const current = deck.getPages();
    // A page tile only overwrites its target page, so a blank one needs no question.
    const target = vorlage.seite ? current.filter((p) => p.id === pageId) : current;
    if (isDeckEmpty(current) || isDeckEmpty(target)) void apply(vorlage, pageId, false);
    else setAsking({ card: vorlage, pageId });
  };

  useImperativeHandle(ref, () => ({
    drop: (id, pageId) => {
      const vorlage = wholeCards.find((v) => v.id === id);
      if (vorlage) {
        choose(vorlage, pageId);
        return;
      }
      const tile =
        seitenLoad.status === 'ready' ? seitenLoad.items.find((t) => t.seite.id === id) : null;
      if (tile) void addSeite(tile.seite, pageId);
    },
  }));

  if (!service) return null;

  const confirmReplace = () => {
    const pick = asking;
    setAsking(null);
    if (pick) void apply(pick.card, pick.pageId, true);
  };

  const confirmNew = () => {
    const pick = asking;
    setAsking(null);
    pick?.card.openAsNew?.();
  };

  // A whole Vorlage shows its sheet as it is; the sharepic grid keeps its classes.
  const aspect = seitenFormat
    ? formatId === 'post-portrait-tall'
      ? 'aspect-[3/4]'
      : 'aspect-[4/5]'
    : '';
  const aspectStyle =
    !seitenFormat && format ? { aspectRatio: `${format.width} / ${format.height}` } : undefined;

  const askingSeite = asking?.card.seite ?? null;

  const errorLine = applyError && (
    <p role="alert" className="m-0 text-[13px] text-[var(--editor-danger-fg)]">
      {applyError}
    </p>
  );

  const wholeView =
    wholeLoad.status === 'error' ? (
      <LoadError
        text="Vorlagen konnten nicht geladen werden."
        onRetry={() => {
          setWholeLoad({ status: 'loading' });
          setWholeAttempt((n) => n + 1);
        }}
      />
    ) : wholeLoad.status === 'loading' ? (
      <LoadingGrid aspect={aspect} aspectStyle={aspectStyle} label="Vorlagen laden" />
    ) : wholeCards.length === 0 ? (
      <p className={HINT}>Für dieses Format gibt es noch keine Vorlagen.</p>
    ) : (
      <>
        {wholeCards.some((v) => v.seite) && (
          <p className="m-0 text-[12px] text-[var(--editor-text-muted)]">
            {canDrag
              ? 'Eine Seite ersetzt die aktuelle Seite. Auf eine Seite gezogen, ersetzt sie diese.'
              : 'Eine Seite ersetzt die aktuelle Seite.'}
          </p>
        )}
        <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
          {wholeCards.map((vorlage) => (
            <VorlageTile
              key={vorlage.id}
              vorlage={vorlage}
              aspect={aspect}
              aspectStyle={aspectStyle}
              busy={busyId === vorlage.id}
              disabled={busyId !== null}
              canDrag={canDrag}
              onPick={() => choose(vorlage, deck.getActivePageId())}
            />
          ))}
        </ul>
      </>
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
      {seitenFormat ? seitenView : wholeView}

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {askingSeite
                ? `Seite ${askingSeite.n} aus „${asking?.card.titel}“ verwenden?`
                : `Vorlage „${asking?.card.titel}“ verwenden?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {askingSeite
                ? asking?.card.openAsNew
                  ? 'Auf dieser Seite ist schon etwas. Ersetze sie durch die Seite der Vorlage oder öffne die ganze Vorlage als neues Design.'
                  : 'Die Seite der Vorlage ersetzt diese Seite. Rückgängig geht danach über „Vorlage verwerfen“.'
                : asking?.card.openAsNew
                  ? 'Auf deinem Design ist schon etwas. Öffne die Vorlage als neues Design oder ersetze dein aktuelles Design damit.'
                  : 'Die Vorlage ersetzt dein aktuelles Design. Rückgängig geht danach über „Vorlage verwerfen“.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            {asking?.card.openAsNew && (
              <Button variant="outline" onClick={confirmNew}>
                Als neues Design öffnen
              </Button>
            )}
            <AlertDialogAction onClick={confirmReplace}>
              {askingSeite ? 'Seite ersetzen' : 'Aktuelles ersetzen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
