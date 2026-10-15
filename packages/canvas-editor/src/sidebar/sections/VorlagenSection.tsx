/**
 * „Vorlagen" tab: the Grünerator-Vorlagen of the design's format, the ones
 * most like the design first (Canva's template panel). A pick lands on an
 * empty design straight away; on one with content it asks first — open the
 * Vorlage as a new sharepic, or replace this design with it (one undo step,
 * offered back through the top bar banner).
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
import { isDeckEmpty, vorlageDeckOps } from '../../collab/vorlageDeck';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';
import { cn } from '../../utils/cn';
import { rankVorlagen, vorlagenForFormat } from '../../utils/vorlagenRelevance';

import type { CanvasSpecEditBridge } from '../../CanvasEditorProvider';
import type { HeterogeneousPage } from '../../configs/types';

export interface VorlagenSectionProps {
  formatId: string;
  /** The pages as they are now; the order is taken from the design when the tab opened. */
  pages: readonly HeterogeneousPage[];
  /** Live page reads and the one-step deck replace. */
  deck: Pick<CanvasSpecEditBridge, 'getPages' | 'replaceDeck'>;
}

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; vorlagen: SharepicVorlage[] };

const HINT = 'm-0 py-4 text-center text-[13px] text-[var(--editor-text-muted)]';

const SECONDARY_BUTTON =
  'h-9 px-3.5 rounded-lg border-none cursor-pointer bg-[var(--editor-tile)] text-[13px] font-semibold text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:opacity-60 disabled:cursor-not-allowed';

const APPLY_ERROR = 'Die Vorlage ließ sich nicht anwenden. Bitte versuche es erneut.';

export function VorlagenSection({ formatId, pages, deck }: VorlagenSectionProps) {
  const { vorlagen: service } = useCanvasEditorServices();
  const setPending = useCanvasStoreSelector((s) => s.setPendingAiSuggestion);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Ranked against the design as it was when the tab opened: a pick must not
  // reshuffle the grid under the pointer.
  const [atOpen] = useState(() => ({ pages, empty: isDeckEmpty(pages) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<SharepicVorlage | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!service) return;
    let live = true;
    service.list().then(
      (vorlagen) => live && setLoad({ status: 'ready', vorlagen }),
      (err: unknown) => {
        console.warn('[VorlagenSection] loading the Vorlagen failed', err);
        if (live) setLoad({ status: 'error' });
      }
    );
    return () => {
      live = false;
    };
  }, [service, attempt]);

  if (!service) return null;

  const apply = async (vorlage: SharepicVorlage, replacing: boolean) => {
    setBusyId(vorlage.id);
    setApplyError(null);
    try {
      const next = await service.compose(vorlage);
      deck.replaceDeck(vorlageDeckOps(deck.getPages(), next, uuid));
      if (replacing) setPending({ title: vorlage.titel, undo: 'pages', source: 'vorlage' });
    } catch (err) {
      console.warn('[VorlagenSection] applying the Vorlage failed', err);
      setApplyError(APPLY_ERROR);
    } finally {
      setBusyId(null);
    }
  };

  const choose = (vorlage: SharepicVorlage) => {
    if (busyId !== null) return;
    if (isDeckEmpty(deck.getPages())) void apply(vorlage, false);
    else setAsking(vorlage);
  };

  const confirmReplace = () => {
    const vorlage = asking;
    setAsking(null);
    if (vorlage) void apply(vorlage, true);
  };

  const openAsNew = service.openAsNew;
  const confirmNew = () => {
    const vorlage = asking;
    setAsking(null);
    if (vorlage && openAsNew) openAsNew(vorlage);
  };

  const aspect = formatId === 'post-portrait-tall' ? 'aspect-[3/4]' : 'aspect-[4/5]';

  if (load.status === 'loading') {
    return (
      <div className="grid w-full grid-cols-2 gap-2" aria-busy="true" aria-label="Vorlagen laden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={cn('w-full rounded-lg', aspect)} />
        ))}
      </div>
    );
  }

  if (load.status === 'error') {
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

  const fitting = vorlagenForFormat(load.vorlagen, formatId);
  if (fitting.length === 0) {
    return <p className={HINT}>Für dieses Format gibt es noch keine Vorlagen.</p>;
  }
  const shown = atOpen.empty ? fitting : rankVorlagen(fitting, atOpen.pages);

  return (
    <div className="flex w-full flex-col gap-2.5">
      {applyError && (
        <p role="alert" className="m-0 text-[13px] text-[var(--editor-danger-fg)]">
          {applyError}
        </p>
      )}
      <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0">
        {shown.map((vorlage) => {
          const seiten = vorlage.spec.slides.length;
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
                >
                  <img
                    src={sharepicVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion)}
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
              {openAsNew
                ? 'Auf deinem Design ist schon etwas. Öffne die Vorlage als neues Sharepic oder ersetze dein aktuelles Design damit.'
                : 'Die Vorlage ersetzt dein aktuelles Design. Rückgängig geht danach über „Vorlage verwerfen“.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            {openAsNew && (
              <Button variant="outline" onClick={confirmNew}>
                Als neues Sharepic öffnen
              </Button>
            )}
            <AlertDialogAction onClick={confirmReplace}>Aktuelles ersetzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
