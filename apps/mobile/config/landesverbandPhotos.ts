import { landesverbandCoverForNotebook } from '@gruenerator/shared/marketplace';

import photoBayern from '../../web/public/images/marketplace/landesverbaende/bayern-v1-card-480.webp';
import photoBerlin from '../../web/public/images/marketplace/landesverbaende/berlin-v1-card-480.webp';
import photoBrandenburg from '../../web/public/images/marketplace/landesverbaende/brandenburg-v1-card-480.webp';
import photoHamburg from '../../web/public/images/marketplace/landesverbaende/hamburg-v1-card-480.webp';
import photoHessen from '../../web/public/images/marketplace/landesverbaende/hessen-v1-card-480.webp';
import photoMecklenburgVorpommern from '../../web/public/images/marketplace/landesverbaende/mecklenburg-vorpommern-v1-card-480.webp';
import photoOesterreich from '../../web/public/images/marketplace/landesverbaende/oesterreich-v1-card-480.webp';
import photoSaarland from '../../web/public/images/marketplace/landesverbaende/saarland-v1-card-480.webp';
import photoSachsenAnhalt from '../../web/public/images/marketplace/landesverbaende/sachsen-anhalt-v1-card-480.webp';
import photoSchleswigHolstein from '../../web/public/images/marketplace/landesverbaende/schleswig-holstein-v1-card-480.webp';
import photoThueringen from '../../web/public/images/marketplace/landesverbaende/thueringen-v1-card-480.webp';

/**
 * The Marktplatz card photo of each Landesverband, bundled rather than loaded
 * from the web origin: 11 files at ~300 KB together, available offline and
 * independent of when the web deploys them. Keys are `cover.file` from
 * `LANDESVERBAND_COVERS`; the web serves the same files under `/images/**`.
 * The imports have to be static — Metro resolves an image at build time.
 */
const PHOTOS: Record<string, number> = {
  'bayern-v1': photoBayern,
  'berlin-v1': photoBerlin,
  'brandenburg-v1': photoBrandenburg,
  'hamburg-v1': photoHamburg,
  'hessen-v1': photoHessen,
  'mecklenburg-vorpommern-v1': photoMecklenburgVorpommern,
  'oesterreich-v1': photoOesterreich,
  'saarland-v1': photoSaarland,
  'sachsen-anhalt-v1': photoSachsenAnhalt,
  'schleswig-holstein-v1': photoSchleswigHolstein,
  'thueringen-v1': photoThueringen,
};

/** The bundled photo of a Marktplatz cover (`cover.file`), `null` when none is bundled. */
export function getLandesverbandPhotoByFile(file: string): number | null {
  return PHOTOS[file] ?? null;
}

/** The bundled photo of a Landesverband notebook, `null` for any other notebook. */
export function getLandesverbandPhoto(notebookId: string): number | null {
  const cover = landesverbandCoverForNotebook(notebookId);
  return cover ? getLandesverbandPhotoByFile(cover.file) : null;
}
