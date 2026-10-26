import { coverPhotoRect, panOfFramedPhoto, type Rect, type Size } from './coverFit';
import { panOfStraightPhoto } from './straighten';
import { type UserImageInstance } from './userImageUtils';

/** Commit a local crop window without moving or resampling the underlying photo. */
export function userImageCropUpdate(
  image: UserImageInstance,
  natural: Size,
  photo: Rect,
  window: Rect
): Partial<UserImageInstance> {
  const radians = (image.rotation * Math.PI) / 180;
  const movedPhoto = { ...photo, x: photo.x - window.x, y: photo.y - window.y };
  const base = coverPhotoRect(natural, window);
  const deg = image.cropRotation ?? 0;
  // Begradigt bleibt das gedrehte Foto liegen; der Zoom darf unter 1 fallen, wo der
  // gedrehte Rahmen schmaler ist als der ungedrehte (ungedrehte Leser setzen ihn auf 1).
  const pan =
    deg !== 0
      ? panOfStraightPhoto(movedPhoto, deg, window, { x: image.panX ?? 0, y: image.panY ?? 0 })
      : panOfFramedPhoto(movedPhoto, window);
  const zoom = photo.width / base.width;
  return {
    x: image.x + image.scale * (window.x * Math.cos(radians) - window.y * Math.sin(radians)),
    y: image.y + image.scale * (window.x * Math.sin(radians) + window.y * Math.cos(radians)),
    width: window.width,
    height: window.height,
    fit: 'cover',
    cropZoom: deg !== 0 ? zoom : Math.max(1, zoom),
    panX: pan.x,
    panY: pan.y,
  };
}
