import { parseDataUrl } from '@gruenerator/shared';
import { zipSync } from 'fflate';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Packs rendered pages (data URLs) into a ZIP in the browser, as
 * `seite-1.png`, `seite-2.png`, … — the extension follows each image's type.
 *
 * A page that cannot be packed throws: a ZIP with fewer images than pages
 * reads as data loss.
 */
export function zipPageImages(dataUrls: string[]): Blob {
  const files: Record<string, Uint8Array> = {};
  dataUrls.forEach((dataUrl, i) => {
    const parsed = parseDataUrl(dataUrl);
    const extension = parsed ? EXTENSION_BY_TYPE[parsed.mediaType] : undefined;
    if (!parsed || !extension) throw new Error(`Seite ${i + 1} konnte nicht exportiert werden`);
    files[`seite-${i + 1}.${extension}`] = Uint8Array.from(atob(parsed.base64), (c) =>
      c.charCodeAt(0)
    );
  });
  // Stored, not deflated: PNG and JPEG are compressed already.
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
