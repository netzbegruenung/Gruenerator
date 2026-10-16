import { profilbildAssetParams, type GalleryAsset } from '@gruenerator/shared/stickers';

export { parseProfilbildAssetParams, type GalleryAsset } from '@gruenerator/shared/stickers';

/** The gallery's „Im Profilbild verwenden": the item travels in the URL, no lookup endpoint needed. */
export function profilbildAssetHref(item: GalleryAsset): string {
  return `/studio/profilbild?${new URLSearchParams(profilbildAssetParams(item)).toString()}`;
}
