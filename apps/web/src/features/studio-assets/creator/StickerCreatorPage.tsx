import { type StudioAssetItem } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { PiSquaresFour } from 'react-icons/pi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { profilbildAssetHref } from '../../studio-tools/utils/galleryAsset';

import { StickerCreator, type StickerCreatorReturn } from './StickerCreator';

const GALLERY_PATH = '/studio/sticker';

const parseReturn = (raw: string | null): StickerCreatorReturn =>
  raw === 'profilbild' || raw === 'canvas' ? raw : null;

const StickerCreatorPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = parseReturn(params.get('return'));

  return (
    <StickerCreator
      className="h-dvh"
      heading={
        <h1 className="m-0 shrink-0 text-[22px] font-semibold text-foreground-heading md:text-2xl">
          Sticker erstellen
        </h1>
      }
      description="Foto freistellen, PNG übernehmen oder Text-Badge gestalten"
      headerEnd={
        <Button asChild variant="outline" size="icon" aria-label="Zur Galerie" title="Zur Galerie">
          <Link to={GALLERY_PATH}>
            <PiSquaresFour aria-hidden="true" className="size-[18px]" />
          </Link>
        </Button>
      }
      returnTo={returnTo}
      {...(returnTo === 'profilbild'
        ? {
            onCreated: (item: StudioAssetItem) =>
              void navigate(profilbildAssetHref(item), { replace: true }),
          }
        : {})}
    />
  );
};

export default StickerCreatorPage;
