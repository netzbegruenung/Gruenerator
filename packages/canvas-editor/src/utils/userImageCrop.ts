import { coverPhotoRect, panOfFramedPhoto, type Rect, type Size } from './coverFit';
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
  const pan = panOfFramedPhoto(movedPhoto, window);
  const base = coverPhotoRect(natural, window);
  return {
    x: image.x + image.scale * (window.x * Math.cos(radians) - window.y * Math.sin(radians)),
    y: image.y + image.scale * (window.x * Math.sin(radians) + window.y * Math.cos(radians)),
    width: window.width,
    height: window.height,
    fit: 'cover',
    cropZoom: Math.max(1, photo.width / base.width),
    panX: pan.x,
    panY: pan.y,
  };
}
