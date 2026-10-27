import { type StudioAssetKind } from '@gruenerator/contracts';
import { toGalleryAsset } from '@gruenerator/shared/marketplace';
import { STUDIO_ASSET_PLURAL } from '@gruenerator/shared/studio-assets';
import { useState } from 'react';
import { PiStorefront } from 'react-icons/pi';

import { MarketplaceDialog } from '../../marketplace/MarketplaceDialog';
import { type GalleryAsset } from '../utils/galleryAsset';

/**
 * Kachel am Ende einer Auswahlreihe: öffnet den Marktplatz als Auswahl, auf
 * die eine Art beschränkt. Eine Wahl schließt ihn und landet auf dem Profilbild.
 */
export function ProfilbildMarketplaceButton({
  kind,
  className,
  label,
  disabled = false,
  onPick,
}: {
  kind: StudioAssetKind;
  className: string;
  /** Visible text next to the icon, e.g. „Shop“. */
  label?: string;
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
        className={className}
      >
        <PiStorefront aria-hidden className="size-5 shrink-0" />
        {label}
      </button>
      <MarketplaceDialog
        open={open}
        onOpenChange={setOpen}
        kinds={[kind]}
        title={`${plural} entdecken`}
        onPick={(item) => onPick(toGalleryAsset(item))}
      />
    </>
  );
}
