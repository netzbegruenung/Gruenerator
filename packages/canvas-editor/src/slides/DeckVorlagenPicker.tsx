/**
 * „Vorlage für alle Folien": die Deck-Vorlagen des Hosts (`loadDeckVorlagen`),
 * je mit drei Beispielfolien. Ein Klick fragt nach und setzt dann alle Folien
 * im Stil der Vorlage neu (`restyleDeck`) — als ein Rückgängig-Schritt über
 * `replaceDeck`. Fehlt der Lader oder scheitert er, bleibt „Offiziell".
 */
import { useAnnounce } from '@ggraphic/editor/hooks/useAnnounce';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ggraphic/editor/ui/alert-dialog';
import { cn } from '@ggraphic/editor/utils/cn';
import { type FolienVorlage } from '@gruenerator/contracts';
import { readDeckStil, restyleDeck } from '@gruenerator/contracts/slides';
import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { vorlageDeckOps } from '../collab/vorlageDeck';

import { DECK_PREVIEW_TYPEN, useDeckStilThumbnail } from './deckStilThumbnails';

import type { DeckPreviewTyp } from './renderDeckStilThumbnail';
import type { BrandLocale } from '../brand/theme';
import type { CanvasSpecEditBridge } from '@ggraphic/editor/CanvasEditorProvider';
import type { HeterogeneousPage } from '@ggraphic/editor/configs/types';

/** Der Stil des Grünen CD: gibt es immer, auch ohne Katalog des Hosts. */
const OFFIZIELL: FolienVorlage = {
  id: 'offiziell',
  titel: 'Offiziell',
  beschreibung: 'Das Corporate Design der Grünen.',
  stil: 'cd',
  locale: 'de-DE',
};

export interface DeckVorlagenPickerProps {
  /** Die Deck-Vorlagen des Hosts; null, wenn er keine kennt. */
  load: (() => Promise<FolienVorlage[]>) | null;
  pages: readonly HeterogeneousPage[];
  deck: Pick<CanvasSpecEditBridge, 'getPages' | 'replaceDeck'>;
  locale: BrandLocale;
}

function PreviewThumb({
  vorlage,
  typ,
  locale,
}: {
  vorlage: FolienVorlage;
  typ: DeckPreviewTyp;
  locale: BrandLocale;
}) {
  const { ref, src, status } = useDeckStilThumbnail(vorlage.stil, typ, locale);
  return (
    <span
      ref={ref}
      data-thumbnail-status={status}
      className="block aspect-video overflow-hidden rounded-sm"
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="block h-full w-full" />
      ) : (
        <span
          className={cn(
            'block h-full w-full bg-[var(--editor-surface-hover)]',
            status === 'loading' && 'motion-safe:animate-pulse'
          )}
        />
      )}
    </span>
  );
}

/** Der Titel des Decks steht in der Fußzeile jeder Folie. */
function deckTitleOf(pages: readonly HeterogeneousPage[]): string {
  for (const page of pages) {
    const texts = page.state.additionalTexts;
    if (!Array.isArray(texts)) continue;
    const title = (texts as { id?: unknown; text?: unknown }[]).find((t) => t.id === 'folie-titel');
    if (typeof title?.text === 'string') return title.text;
  }
  return '';
}

export function DeckVorlagenPicker({ load, pages, deck, locale }: DeckVorlagenPickerProps) {
  const announce = useAnnounce();
  const [catalogue, setCatalogue] = useState<FolienVorlage[]>([OFFIZIELL]);
  const [asking, setAsking] = useState<FolienVorlage | null>(null);

  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (vorlagen) => {
        if (live && vorlagen.length > 0) {
          setCatalogue(vorlagen.some((v) => v.stil === 'cd') ? vorlagen : [OFFIZIELL, ...vorlagen]);
        }
      },
      (err: unknown) => {
        console.warn('[DeckVorlagenPicker] loading the deck Vorlagen failed', err);
      }
    );
    return () => {
      live = false;
    };
  }, [load]);

  const active = readDeckStil(pages);

  const confirm = () => {
    const pick = asking;
    setAsking(null);
    if (!pick) return;
    const current = deck.getPages();
    const next = restyleDeck(
      current.map(({ id, configId, state }) => ({ id, configId, state })),
      pick.stil,
      { locale, date: new Date(), title: deckTitleOf(current) }
    );
    deck.replaceDeck(vorlageDeckOps(current, next, uuid));
    announce(`Alle Folien in „${pick.titel}“ neu gesetzt.`);
  };

  return (
    <section aria-label="Vorlage für alle Folien" className="flex flex-col gap-1.5">
      <h4 className="m-0 text-xs font-semibold text-[var(--editor-text-secondary)]">
        Vorlage für alle Folien
      </h4>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {catalogue.map((vorlage) => (
          <li key={vorlage.id}>
            <button
              type="button"
              aria-pressed={vorlage.stil === active}
              onClick={() => setAsking(vorlage)}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-1 rounded-md border bg-[var(--editor-tile)] p-1.5 text-left text-[var(--editor-text)] transition-[border-color] duration-150 hover:border-[var(--editor-accent)] kbd:focus-visible:outline-2 kbd:focus-visible:outline-[var(--editor-accent)]',
                vorlage.stil === active
                  ? 'border-[var(--editor-accent)]'
                  : 'border-[var(--editor-border)]'
              )}
            >
              <span className="grid grid-cols-3 gap-1">
                {DECK_PREVIEW_TYPEN.map((typ) => (
                  <PreviewThumb key={typ} vorlage={vorlage} typ={typ} locale={locale} />
                ))}
              </span>
              <span className="text-xs font-medium leading-tight">{vorlage.titel}</span>
              <span className="text-[11px] leading-tight text-[var(--editor-text-muted)]">
                {vorlage.beschreibung}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle Folien in „{asking?.titel}“ neu setzen?</AlertDialogTitle>
            <AlertDialogDescription>Texte und eigene Elemente bleiben.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>Neu setzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
