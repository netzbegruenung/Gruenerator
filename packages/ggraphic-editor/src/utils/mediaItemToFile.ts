// SPDX-License-Identifier: MPL-2.0
import { plainAssetImageUrls, registeredAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

import type { CanvasMediaItem } from '@ggraphic/editor/hostServices';

export function buildMediaItemUrl(item: CanvasMediaItem): string | null {
  if (item.mediaUrl) return item.mediaUrl;
  const download = item.shareToken
    ? (registeredAssetCatalog().imageUrls ?? plainAssetImageUrls).shareDownload(item.shareToken)
    : null;
  return download ?? item.thumbnailUrl;
}

export async function mediaItemToFile(item: CanvasMediaItem): Promise<File> {
  const url = buildMediaItemUrl(item);
  if (!url) throw new Error('Bild hat keine ladbare URL');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Bild konnte nicht geladen werden');
  const blob = await response.blob();
  const filename = item.originalFilename ?? item.title ?? `upload-${item.id}`;
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
