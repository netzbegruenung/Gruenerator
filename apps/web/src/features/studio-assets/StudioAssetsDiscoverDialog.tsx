import { type StudioAssetSort } from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState, type JSX } from 'react';
import { LuArrowDownUp } from 'react-icons/lu';
import { PiX } from 'react-icons/pi';

import { FilterMenuButton, GalleryEmptyState } from '../../components/common/Gallery/parts';
import { PageHeroSearch } from '../../components/common/PageHero';

import { StudioAssetSection } from './StudioAssetSection';
import { useStudioAssetActions } from './useStudioAssetActions';
import { useDebouncedSearch, useDiscoverStudioAssets } from './useStudioAssetSections';

const SORT_OPTIONS: { id: StudioAssetSort; label: string }[] = [
  { id: 'new', label: 'Neu' },
  { id: 'popular', label: 'Beliebt' },
];

/**
 * „Entdecken“ — was andere öffentlich teilen, als Popup über der eigenen
 * Sammlung (Vorbild: die Agentura über `/grueneratoren`).
 */
export function StudioAssetsDiscoverDialog({
  open,
  onClose,
  initialQuery = '',
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayProps={{ className: 'bg-black/30 backdrop-blur-md' }}
        className="flex h-[min(88dvh,960px)] w-full flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[min(1200px,calc(100%-3rem))]"
      >
        {open && <Discover initialQuery={initialQuery} />}
      </DialogContent>
    </Dialog>
  );
}

function Discover({ initialQuery }: { initialQuery: string }): JSX.Element {
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [sort, setSort] = useState<StudioAssetSort>('new');
  const q = useDebouncedSearch(searchInput);
  const { handlers, dialogs } = useStudioAssetActions();
  const stickers = useDiscoverStudioAssets('sticker', q, sort);
  const backgrounds = useDiscoverStudioAssets('background', q, sort);

  const sections = [
    { title: 'Sticker', ...stickers },
    { title: 'Hintergründe', ...backgrounds },
  ].filter((s) => s.data.isLoading || s.data.items.length > 0);
  const settled = stickers.settled && backgrounds.settled;
  const error = stickers.error ?? backgrounds.error;
  const total = stickers.data.items.length + backgrounds.data.items.length;

  return (
    <>
      <div className="flex flex-col gap-sm border-b border-grey-200 px-lg pt-lg pb-md dark:border-grey-700">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-md">
          <DialogTitle className="m-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-foreground-heading">
            Entdecken
          </DialogTitle>
          <div className="relative flex shrink-0 items-center gap-1 text-grey-500">
            <PageHeroSearch
              query={searchInput}
              onQuery={setSearchInput}
              placeholder="Sticker und Hintergründe durchsuchen…"
            />
            <FilterMenuButton
              label={sort === 'popular' ? 'Sortierung: Beliebt' : 'Sortierung'}
              menuLabel="Sortieren"
              value={sort}
              options={SORT_OPTIONS}
              onChange={(value) => setSort(value as StudioAssetSort)}
              active={sort !== 'new'}
              icon={<LuArrowDownUp aria-hidden className="size-[18px]" />}
            />
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" title="Schließen">
                <PiX aria-hidden className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="m-0 max-w-[40rem] text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
          Was andere öffentlich teilen. Merke dir, was dir gefällt — es steht dann bei deinen
          Stickern und Hintergründen.
        </DialogDescription>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-lg">
        <span role="status" aria-live="polite" className="sr-only">
          {`${total} ${total === 1 ? 'Eintrag' : 'Einträge'}`}
        </span>
        {sections.length > 0 ? (
          <div className="flex flex-col gap-xl">
            {sections.map((s) => (
              <StudioAssetSection key={s.title} title={s.title} data={s.data} handlers={handlers} />
            ))}
          </div>
        ) : error ? (
          <GalleryEmptyState title="Konnte nicht geladen werden" hint={error.message} />
        ) : settled ? (
          <GalleryEmptyState
            title={q ? 'Nichts gefunden' : 'Hier ist gerade nichts'}
            hint={
              q
                ? 'Versuch ein anderes Stichwort.'
                : 'Sobald jemand Sticker oder Hintergründe öffentlich teilt, stehen sie hier.'
            }
          />
        ) : null}
      </div>
      {dialogs}
    </>
  );
}
