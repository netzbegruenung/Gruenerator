import { type StudioAssetKind } from '@gruenerator/contracts';
import { STUDIO_ASSET_PLURAL } from '@gruenerator/shared/studio-assets';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiStorefront, PiX } from 'react-icons/pi';

import { PageHeroSearch } from '../../../components/common/PageHero';
import { useDebouncedSearch } from '../../studio-assets/useStudioAssetSections';
import { type GalleryAsset } from '../utils/galleryAsset';

import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

/**
 * Kachel „Entdecken“ am Ende einer Auswahlreihe: öffnet, was andere teilen, als
 * Popup — dieselbe Form wie auf `/studio/sticker`. Eine Wahl schließt es.
 */
export function ProfilbildDiscoverButton({
  kind,
  buttonClassName,
  tileClassName,
  disabled = false,
  onPick,
}: {
  kind: StudioAssetKind;
  buttonClassName: string;
  /** Kacheln der Einträge im Popup — dieselben wie in der Auswahlreihe. */
  tileClassName: string;
  disabled?: boolean;
  onPick: (item: GalleryAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const plural = STUDIO_ASSET_PLURAL[kind];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`${plural} entdecken`}
        title={`${plural} entdecken`}
        className={buttonClassName}
      >
        <PiStorefront aria-hidden className="size-5 text-grey-600 dark:text-grey-300" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          overlayProps={{ className: 'bg-black/30 backdrop-blur-md' }}
          className="flex h-[min(80dvh,760px)] w-full flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[min(820px,calc(100%-3rem))]"
        >
          {open && (
            <Discover
              kind={kind}
              tileClassName={tileClassName}
              onPick={(item) => {
                setOpen(false);
                onPick(item);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Discover({
  kind,
  tileClassName,
  onPick,
}: {
  kind: StudioAssetKind;
  tileClassName: string;
  onPick: (item: GalleryAsset) => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedSearch(searchInput);
  const plural = STUDIO_ASSET_PLURAL[kind];

  return (
    <>
      <div className="flex flex-col gap-sm border-b border-grey-200 px-lg pt-lg pb-md dark:border-grey-700">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-md">
          <DialogTitle className="m-0 text-xl leading-tight font-bold text-foreground-heading">
            {plural} entdecken
          </DialogTitle>
          <div className="relative flex shrink-0 items-center gap-1 text-grey-500">
            <PageHeroSearch
              query={searchInput}
              onQuery={setSearchInput}
              placeholder={`${plural} durchsuchen…`}
            />
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" title="Schließen">
                <PiX aria-hidden className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="m-0 text-sm text-grey-500 dark:text-grey-400">
          Was andere öffentlich teilen. Tippe ein Bild an, um es zu verwenden.
        </DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-lg">
        <ProfilbildGalleryGrid
          kind={kind}
          source="shop"
          q={q}
          tileClassName={tileClassName}
          onPick={onPick}
          emptyHint={q ? 'Nichts gefunden.' : `Noch keine ${plural} zum Entdecken.`}
        />
      </div>
    </>
  );
}
