/**
 * „Vorlagen" tab: the Grünerator-Vorlagen of the design's format, the ones
 * most like the design first (Canva's template panel). A pick lands on an
 * empty design straight away; on one with content it asks first — open the
 * Vorlage as a new design, or replace this design with it (one undo step,
 * offered back through the top bar banner).
 *
 * Two catalogues feed the same grid: the sharepic Vorlagen come from the
 * host (`list`/`compose`), the print Vorlagen ship with this package and
 * compose here. Both become a `VorlageCard` that knows how to compose and
 * open itself, so picking, asking and replacing are one code path.
 */
import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
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
import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { carryImpressum, isDeckEmpty, vorlageDeckOps } from '../../collab/vorlageDeck';
import { composePrint } from '../../composer/composePrint';
import { printVorlagenFor, type PrintVorlage } from '../../composer/printVorlagen';
import { getCanvasFormat, isPrintFormat, type PrintCanvasFormat } from '../../formats';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';
import { cn } from '../../utils/cn';
import { ensureFontsReady } from '../../utils/ensureFontsReady';
import { rankVorlagen, vorlagenForFormat } from '../../utils/vorlagenRelevance';

import type {
  CanvasSpecEditBridge,
  CanvasVorlagenService,
  VorlagePage,
} from '../../CanvasEditorProvider';
import type { HeterogeneousPage } from '../../configs/types';

export interface VorlagenSectionProps {
  formatId: string;
  /** The pages as they are now; the order is taken from the design when the tab opened. */
  pages: readonly HeterogeneousPage[];
  /** Live page reads and the one-step deck replace. */
  deck: Pick<CanvasSpecEditBridge, 'getPages' | 'replaceDeck'>;
}

/** One tile of the grid, whichever catalogue it comes from. */
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

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; cards: VorlageCard[] };

function sharepicCard(vorlage: SharepicVorlage, service: CanvasVorlagenService): VorlageCard {
  const { openAsNew } = service;
  return {
    id: vorlage.id,
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    thumb: sharepicVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion),
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

const HINT = 'm-0 py-4 text-center text-[13px] text-[var(--editor-text-muted)]';

const SECONDARY_BUTTON =
  'h-9 px-3.5 rounded-lg border-none cursor-pointer bg-[var(--editor-tile)] text-[13px] font-semibold text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:opacity-60 disabled:cursor-not-allowed';

const APPLY_ERROR = 'Die Vorlage ließ sich nicht anwenden. Bitte versuche es erneut.';

export function VorlagenSection({ formatId, pages, deck }: VorlagenSectionProps) {
  const { vorlagen: service, userLocale = 'de-DE' } = useCanvasEditorServices();
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Ranked against the design as it was when the tab opened: a pick must not
  // reshuffle the grid under the pointer.
  const [atOpen] = useState(() => ({ pages, empty: isDeckEmpty(pages) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<VorlageCard | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const format = getCanvasFormat(formatId);
  const printFormat = format && isPrintFormat(format) ? format : null;

  useEffect(() => {
    if (!service || printFormat) return;
    let live = true;
    service.list().then(
      (vorlagen) => {
        if (!live) return;
        const fitting = vorlagenForFormat(vorlagen, formatId);
        const shown = atOpen.empty ? fitting : rankVorlagen(fitting, atOpen.pages);
        setLoad({ status: 'ready', cards: shown.map((v) => sharepicCard(v, service)) });
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

  if (!service) return null;

  // One print Vorlage per format and country, shipped with the package: nothing to load or rank.
  const shownLoad: Load = printFormat
    ? {
        status: 'ready',
        cards: printVorlagenFor(userLocale)
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

  const choose = (vorlage: VorlageCard) => {
    if (busyId !== null) return;
    if (isDeckEmpty(deck.getPages())) void apply(vorlage, false);
    else setAsking(vorlage);
  };

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

  if (shownLoad.status === 'loading') {
    return (
      <div className="grid w-full grid-cols-2 gap-2" aria-busy="true" aria-label="Vorlagen laden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={cn('w-full rounded-lg', aspect)} style={aspectStyle} />
        ))}
      </div>
    );
  }

  if (shownLoad.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-2">
        <p className={HINT}>Vorlagen konnten nicht geladen werden.</p>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (shownLoad.cards.length === 0) {
    return <p className={HINT}>Für dieses Format gibt es noch keine Vorlagen.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-2.5">
      {applyError && (
        <p role="alert" className="m-0 text-[13px] text-[var(--editor-danger-fg)]">
          {applyError}
        </p>
      )}
      <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
        {shownLoad.cards.map((vorlage) => {
          const { seiten } = vorlage;
          return (
            <li key={vorlage.id}>
              <button
                type="button"
                title={vorlage.beschreibung}
                aria-label={`Vorlage „${vorlage.titel}“ anwenden`}
                aria-busy={busyId === vorlage.id}
                disabled={busyId !== null}
                onClick={() => choose(vorlage)}
                className="flex w-full cursor-pointer flex-col gap-1 rounded-lg border-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:cursor-wait"
              >
                <span
                  className={cn(
                    'relative block w-full overflow-hidden rounded-lg bg-[var(--editor-tile)]',
                    aspect
                  )}
                  style={aspectStyle}
                >
                  <img
                    src={vorlage.thumb}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-150 hover:scale-[1.02]"
                  />
                  {seiten > 1 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-semibold text-white">
                      {seiten} Seiten
                    </span>
                  )}
                  {busyId === vorlage.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-[12px] font-medium leading-tight text-[var(--editor-text)]">
                  {vorlage.titel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

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
