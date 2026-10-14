import { studioAssetKindSchema, type StudioAssetItem } from '@gruenerator/contracts';
import { assetStickerId, isAssetStickerId, isShareSrc } from '@gruenerator/shared/stickers';

/** What the Profilbild needs of a gallery item; `width`/`height` 0 means unknown. */
export type GalleryAsset = Pick<
  StudioAssetItem,
  'id' | 'kind' | 'src' | 'title' | 'width' | 'height'
>;

/** The gallery's „Im Profilbild verwenden": the item travels in the URL, no lookup endpoint needed. */
export function profilbildAssetHref(item: GalleryAsset): string {
  const params = new URLSearchParams({
    asset: item.id,
    kind: item.kind,
    src: item.src,
    w: String(item.width),
    h: String(item.height),
    title: item.title,
  });
  return `/studio/profilbild?${params.toString()}`;
}

const dimension = (raw: string | null) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** Reads a deep link back; anything that is not a gallery uuid plus a share path is ignored. */
export function parseProfilbildAssetParams(params: URLSearchParams): GalleryAsset | null {
  const id = params.get('asset') ?? '';
  const src = params.get('src') ?? '';
  const kind = studioAssetKindSchema.safeParse(params.get('kind'));
  if (!kind.success || !isAssetStickerId(assetStickerId(id)) || !isShareSrc(src)) return null;
  return {
    id,
    kind: kind.data,
    src,
    title: (params.get('title') ?? '').trim().slice(0, 120),
    width: dimension(params.get('w')),
    height: dimension(params.get('h')),
  };
}
