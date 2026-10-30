/**
 * „Folien aus Vorlagen": jede Deck-Vorlage mit allen ihren Folientypen als
 * einzelne Folie, wie die Seiten einer mehrseitigen Sharepic-Vorlage. Der Stil
 * des Decks steht zuerst und offen, die übrigen sind eingeklappt. Ein Klick
 * fügt die Folie ein, auf eine Seite gezogen landet sie dahinter.
 */
import { cn } from '@ggraphic/editor/utils/cn';
import { type FolienVorlage } from '@gruenerator/contracts';
import {
  FOLIEN_TYP_IDS,
  FOLIEN_TYPEN,
  readDeckStil,
  type DeckStilId,
  type FolienTypId,
} from '@gruenerator/contracts/slides';
import { useState, type DragEvent } from 'react';

import { useDeckStilThumbnail } from './deckStilThumbnails';
import { useDeckCatalogue } from './useDeckCatalogue';

import type { BrandLocale } from '../brand/theme';
import type { HeterogeneousPage } from '@ggraphic/editor/configs/types';

export interface DeckSlidePickerProps {
  /** Die Deck-Vorlagen des Hosts; null, wenn er keine kennt. */
  load: (() => Promise<FolienVorlage[]>) | null;
  pages: readonly HeterogeneousPage[];
  locale: BrandLocale;
  disabled: boolean;
  onSelect: (stil: DeckStilId, typ: FolienTypId) => void;
  /** Ziehen auf eine Seite; null, wo es nichts zu ziehen gibt. */
  onDragStart:
    ((e: DragEvent<HTMLButtonElement>, stil: DeckStilId, typ: FolienTypId) => void) | null;
}

function SlideThumb({
  stil,
  typ,
  locale,
}: {
  stil: DeckStilId;
  typ: FolienTypId;
  locale: BrandLocale;
}) {
  const { ref, src, status } = useDeckStilThumbnail(stil, typ, locale);
  return (
    <span
      ref={ref}
      data-thumbnail-status={status}
      className="block aspect-video w-full overflow-hidden rounded-sm"
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

function VorlageGroup({
  vorlage,
  current,
  locale,
  disabled,
  onSelect,
  onDragStart,
}: {
  vorlage: FolienVorlage;
  current: boolean;
  locale: BrandLocale;
  disabled: boolean;
  onSelect: DeckSlidePickerProps['onSelect'];
  onDragStart: DeckSlidePickerProps['onDragStart'];
}) {
  const [open, setOpen] = useState(current);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-md border border-[var(--editor-border)] bg-[var(--editor-tile)] p-1.5"
    >
      <summary className="cursor-pointer text-xs font-medium text-[var(--editor-text)] kbd:focus-visible:outline-2 kbd:focus-visible:outline-[var(--editor-accent)]">
        {vorlage.titel}
      </summary>
      {open && (
        <ul className="m-0 mt-1.5 grid list-none grid-cols-2 gap-1.5 p-0">
          {FOLIEN_TYP_IDS.map((typ) => {
            const label = FOLIEN_TYPEN[typ].label;
            return (
              <li key={typ}>
                <button
                  type="button"
                  aria-label={`${label} – ${vorlage.titel} einfügen`}
                  disabled={disabled}
                  draggable={!!onDragStart && !disabled}
                  onDragStart={onDragStart ? (e) => onDragStart(e, vorlage.stil, typ) : undefined}
                  onClick={() => onSelect(vorlage.stil, typ)}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface)] p-1 text-left text-[var(--editor-text)] transition-[border-color] duration-150 hover:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-60 kbd:focus-visible:outline-2 kbd:focus-visible:outline-[var(--editor-accent)]"
                >
                  <SlideThumb stil={vorlage.stil} typ={typ} locale={locale} />
                  <span aria-hidden="true" className="text-[11px] leading-tight">
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

export function DeckSlidePicker({
  load,
  pages,
  locale,
  disabled,
  onSelect,
  onDragStart,
}: DeckSlidePickerProps) {
  const catalogue = useDeckCatalogue(load);
  const active = readDeckStil(pages);
  const first = catalogue.find((v) => v.stil === active);
  const ordered = first ? [first, ...catalogue.filter((v) => v !== first)] : catalogue;

  return (
    <section aria-label="Folien aus Vorlagen" className="flex flex-col gap-1.5">
      <h4 className="m-0 text-xs font-semibold text-[var(--editor-text-secondary)]">
        Folien aus Vorlagen
      </h4>
      {ordered.map((vorlage) => (
        <VorlageGroup
          key={vorlage.id}
          vorlage={vorlage}
          current={vorlage === first}
          locale={locale}
          disabled={disabled}
          onSelect={onSelect}
          onDragStart={onDragStart}
        />
      ))}
    </section>
  );
}
