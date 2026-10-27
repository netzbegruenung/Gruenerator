// SPDX-License-Identifier: MPL-2.0

/** A placed or saved sticker: the catalog id and src, or `asset:<uuid>` and a share path. */
export interface StickerRef {
  id: string;
  src: string;
}
