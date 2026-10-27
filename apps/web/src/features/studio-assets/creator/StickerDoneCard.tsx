import { type StudioAssetItem } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { PiCheckCircle } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { profilbildAssetHref } from '../../studio-tools/utils/galleryAsset';

import { type StickerCreatorReturn } from './StickerCreator';

import { cn } from '@/utils/cn';

const GALLERY_PATH = '/studio/sticker';

export interface StickerDoneCardProps {
  item: StudioAssetItem;
  previewUrl: string | null;
  returnTo: StickerCreatorReturn;
  onStartOver: () => void;
  className?: string;
}

/** The closing step after a save; a tab opened from the canvas only says it may be closed. */
export function StickerDoneCard({
  item,
  previewUrl,
  returnTo,
  onStartOver,
  className,
}: StickerDoneCardProps): JSX.Element {
  return (
    <main
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-md overflow-y-auto bg-background-alt p-6 text-center',
        className
      )}
    >
      <PiCheckCircle aria-hidden="true" className="size-12 text-primary-600" />
      {previewUrl ? (
        <img src={previewUrl} alt="" className="max-h-[240px] max-w-full object-contain" />
      ) : null}
      <h2 className="m-0 text-lg font-semibold text-foreground-heading">Fertig!</h2>
      {returnTo === 'canvas' ? (
        <p className="m-0 max-w-[32rem] text-pretty text-foreground">
          „{item.title}“ ist gespeichert. Du findest ihn im Canvas in der Seitenleiste unter „Meine“
          – du kannst diesen Tab jetzt schließen.
        </p>
      ) : (
        <p className="m-0 max-w-[32rem] text-pretty text-foreground">
          „{item.title}“ ist gespeichert und liegt in der Galerie unter „Meine“.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-sm">
        {returnTo !== 'canvas' && (
          <Button asChild variant="brand">
            <Link to={profilbildAssetHref(item)}>Im Profilbild verwenden</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to={GALLERY_PATH}>Zur Galerie</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          Noch einen Sticker
        </Button>
      </div>
    </main>
  );
}
