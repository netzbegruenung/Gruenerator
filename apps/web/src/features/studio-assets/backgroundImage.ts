export const BACKGROUND_MAX_SIDE = 2160;
export const BACKGROUND_MIN_SIDE = 64;
export const BACKGROUND_ACCEPT = 'image/png,image/jpeg,image/webp';

export class BackgroundImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new BackgroundImageError('Das Bild konnte nicht gelesen werden.'));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/**
 * Scales the longer side down to {@link BACKGROUND_MAX_SIDE} and re-encodes as
 * WebP — the API only takes PNG/WebP for studio assets. Browsers without a WebP
 * encoder hand back PNG from `toBlob`, which is accepted as well.
 */
export async function prepareBackgroundImage(file: File): Promise<Blob> {
  if (!BACKGROUND_ACCEPT.split(',').includes(file.type)) {
    throw new BackgroundImageError('Bitte wähle ein PNG-, JPEG- oder WebP-Bild.');
  }
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (Math.min(w, h) < BACKGROUND_MIN_SIDE) {
    throw new BackgroundImageError(
      `Das Bild ist zu klein (mindestens ${BACKGROUND_MIN_SIDE} Pixel pro Seite).`
    );
  }
  const scale = Math.min(1, BACKGROUND_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new BackgroundImageError('Das Bild konnte nicht verarbeitet werden.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9)
  );
  if (!blob || (blob.type !== 'image/webp' && blob.type !== 'image/png')) {
    throw new BackgroundImageError('Das Bild konnte nicht verarbeitet werden.');
  }
  return blob;
}
