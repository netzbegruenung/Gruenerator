import { type StudioAssetItem } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { PageHero, PageShell } from '../../../components/common/PageHero';
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
    <PageShell>
      <PageHero
        title="Sticker erstellen"
        description={
          <p className="m-0 text-sm leading-relaxed text-pretty text-grey-600 dark:text-grey-400">
            Gestalte Sticker für dein Profilbild und deine Sharepics – aus einem Bild, einem Foto
            oder als Text-Badge in den Parteifarben.
          </p>
        }
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link to={GALLERY_PATH}>Zur Galerie</Link>
          </Button>
        }
      />
      <StickerCreator
        returnTo={returnTo}
        {...(returnTo === 'profilbild'
          ? {
              onCreated: (item: StudioAssetItem) =>
                void navigate(profilbildAssetHref(item), { replace: true }),
            }
          : {})}
      />
    </PageShell>
  );
};

export default StickerCreatorPage;
