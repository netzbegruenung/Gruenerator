import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { stickersForLocale, type ProfilbildSticker } from '@gruenerator/shared/profilbild';
import { PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { type GalleryAsset } from '../utils/galleryAsset';

import { ACTION_TILE_CLASS } from './ProfilbildBackgroundPicker';
import { ProfilbildDiscoverButton } from './ProfilbildDiscoverDialog';
import { ProfilbildGalleryGrid } from './ProfilbildGalleryGrid';

import { cn } from '@/utils/cn';

const STICKER_TILE_CLASS =
  'flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-grey-300 p-1 outline-none transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grey-600';
// Gallery stickers are transparent cut-outs: a checkerboard keeps their edge visible.
const SHOP_TILE_CLASS =
  `${STICKER_TILE_CLASS} bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px] ` +
  'dark:bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1f1f1f_0%_50%)]';
const STICKER_ACTION_CLASS = cn(ACTION_TILE_CLASS, 'size-14');

export interface ProfilbildStickerPickerProps {
  locale: 'de-DE' | 'de-AT';
  disabled: boolean;
  onAddSystem: (sticker: ProfilbildSticker) => void;
  onAddAsset: (item: GalleryAsset) => void;
}

/**
 * Eine Reihe ohne Reiter: die Grünen-Sticker, dahinter die eigenen und
 * gemerkten, dann Erstellen und Entdecken als Kacheln.
 */
export function ProfilbildStickerPicker({
  locale,
  disabled,
  onAddSystem,
  onAddAsset,
}: ProfilbildStickerPickerProps) {
  return (
    <div className="flex flex-col gap-sm p-1">
      <div role="group" aria-label="Grüne Sticker" className="flex flex-wrap gap-sm">
        {stickersForLocale(locale).map((st) => (
          <button
            key={st.id}
            type="button"
            aria-label={`Sticker ${st.label} hinzufügen`}
            title={st.label}
            disabled={disabled}
            onClick={() => onAddSystem(st)}
            className={STICKER_TILE_CLASS}
            style={{ background: CANVAS_COLORS.TANNE }}
          >
            <img src={st.src} alt="" aria-hidden="true" className="max-h-full max-w-full" />
          </button>
        ))}
      </div>
      <div role="group" aria-label="Deine Sticker">
        <ProfilbildGalleryGrid
          kind="sticker"
          source="own"
          tileClassName={SHOP_TILE_CLASS}
          disabled={disabled}
          onPick={onAddAsset}
          trailing={
            <>
              <Link
                to="/studio/sticker/neu?return=profilbild"
                aria-label="Sticker erstellen"
                title="Sticker erstellen"
                className={STICKER_ACTION_CLASS}
              >
                <PiPlus aria-hidden className="size-5" />
              </Link>
              <ProfilbildDiscoverButton
                kind="sticker"
                buttonClassName={STICKER_ACTION_CLASS}
                tileClassName={SHOP_TILE_CLASS}
                disabled={disabled}
                onPick={onAddAsset}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
