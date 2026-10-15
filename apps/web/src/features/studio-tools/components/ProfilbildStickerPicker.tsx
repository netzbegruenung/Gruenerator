import { stickersForLocale, type ProfilbildSticker } from '@gruenerator/shared/profilbild';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiPlus, PiX } from 'react-icons/pi';

import { StickerCreator } from '../../studio-assets/creator/StickerCreator';
import { type GalleryAsset } from '../utils/galleryAsset';

import { ProfilbildDiscoverButton } from './ProfilbildDiscoverDialog';
import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

import { cn } from '@/utils/cn';

// Inspektor-Raster: vier Spalten, 52 px hohe Kacheln auf ruhigem Grund.
const STICKER_TILE_CLASS =
  'flex h-[52px] min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] bg-background-alt p-1.5 outline-none transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
// Gallery stickers are transparent cut-outs: a checkerboard keeps their edge visible.
const SHOP_TILE_CLASS =
  `${STICKER_TILE_CLASS} bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px] ` +
  'dark:bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1f1f1f_0%_50%)]';
/** Feste Kachelgröße im Entdecken-Dialog, der kein Raster hat. */
const SHOP_DIALOG_TILE_CLASS = cn(SHOP_TILE_CLASS, 'size-14 shrink-0');
const STICKER_ACTION_CLASS =
  'flex h-[52px] min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-border text-sm font-bold text-foreground outline-none transition-colors hover:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const GRID_CLASS = 'grid grid-cols-4 gap-2 p-0.5';

export interface ProfilbildStickerPickerProps {
  locale: 'de-DE' | 'de-AT';
  disabled: boolean;
  onAddSystem: (sticker: ProfilbildSticker) => void;
  onAddAsset: (item: GalleryAsset) => void;
}

/**
 * Ein Raster: die Grünen-Sticker, dahinter die eigenen und gemerkten, am Ende
 * „Shop" (Entdecken) und Erstellen.
 */
export function ProfilbildStickerPicker({
  locale,
  disabled,
  onAddSystem,
  onAddAsset,
}: ProfilbildStickerPickerProps) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ProfilbildGalleryGrid
        kind="sticker"
        source="own"
        gridClassName={GRID_CLASS}
        tileClassName={SHOP_TILE_CLASS}
        disabled={disabled}
        onPick={onAddAsset}
        leading={stickersForLocale(locale).map((st) => (
          <button
            key={st.id}
            type="button"
            aria-label={`Sticker ${st.label} hinzufügen`}
            title={st.label}
            disabled={disabled}
            onClick={() => onAddSystem(st)}
            className={STICKER_TILE_CLASS}
          >
            <img src={st.src} alt="" aria-hidden="true" className="max-h-full max-w-full" />
          </button>
        ))}
        trailing={
          <>
            <ProfilbildDiscoverButton
              kind="sticker"
              label="Shop"
              buttonClassName={STICKER_ACTION_CLASS}
              tileClassName={SHOP_DIALOG_TILE_CLASS}
              disabled={disabled}
              onPick={onAddAsset}
            />
            <button
              type="button"
              aria-label="Sticker erstellen"
              title="Sticker erstellen"
              disabled={disabled}
              onClick={() => setCreating(true)}
              className={STICKER_ACTION_CLASS}
            >
              <PiPlus aria-hidden className="size-5" />
            </button>
          </>
        }
      />
      {/* Der Ersteller im Dialog: das Profilbild bleibt offen, der neue Sticker landet darauf. */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(90dvh,860px)] w-full flex-col gap-md overflow-y-auto rounded-[20px] p-lg sm:max-w-[min(900px,calc(100%-3rem))]"
        >
          <div className="flex items-start justify-between gap-md">
            <div className="flex flex-col gap-1">
              <DialogTitle className="m-0 text-xl leading-tight font-bold text-foreground-heading">
                Sticker erstellen
              </DialogTitle>
              <DialogDescription className="m-0 text-sm text-muted-foreground">
                Aus einem Bild, einem Foto oder als Text-Badge – fertig liegt er auf deinem
                Profilbild.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Schließen" title="Schließen">
                <PiX aria-hidden className="size-[18px]" />
              </Button>
            </DialogClose>
          </div>
          {creating ? (
            <StickerCreator
              returnTo="profilbild"
              onCreated={(item) => {
                setCreating(false);
                onAddAsset(item);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
