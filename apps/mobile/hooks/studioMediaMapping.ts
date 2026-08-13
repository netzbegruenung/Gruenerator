import { type CanvasListItem } from '@gruenerator/contracts';
import { type Project } from '@gruenerator/shared';
import { isKiImage } from '@gruenerator/shared/media-library/contentOrigin';
import { type Share } from '@gruenerator/shared/share';

import { type RecentItem } from './useRecentActivity';

function shareToItem(share: Share): RecentItem {
  return {
    // The share token, not a row id — `useOpenRecentItem` hands this straight to
    // the in-app viewer as `shareToken`.
    id: share.shareToken,
    title: share.title || 'Ohne Titel',
    date: share.createdAt,
    type: 'image',
    href: `/share/${share.shareToken}`,
    // A fresh share has no thumbnail until the variants pass finishes; the
    // preview route renders one on demand. Same fallback the web feed uses —
    // without it a just-created sharepic shows as a blank plate.
    thumbnailUrl: share.thumbnailUrl ?? `/api/share/${share.shareToken}/preview?w=400&fmt=webp`,
  };
}

/**
 * ISO strings from Postgres: lexicographic order is chronological order.
 *
 * Defensive against a non-string `date`: a single malformed row used to throw
 * "undefined is not a function" out of `Array.sort` and take the whole Studio tab
 * down with it (a `Date` has no `localeCompare`). Sorting is not worth a blank
 * screen — an unusable timestamp sorts last instead.
 */
function byDateDesc(a: RecentItem, b: RecentItem): number {
  const left = typeof a.date === 'string' ? a.date : '';
  const right = typeof b.date === 'string' ? b.date : '';
  return right.localeCompare(left);
}

/**
 * Published image shares that are not KI output, merged with the canvases still
 * open for editing — web groups the two the same way.
 *
 * No dedup: an exported share and the canvas it came from are two artifacts with
 * no linking key between them.
 */
export function toSharepicItems(shares: Share[], canvases: CanvasListItem[]): RecentItem[] {
  const shareItems = shares.filter((share) => !isKiImage(share)).map(shareToItem);
  const canvasItems = canvases.map((canvas): RecentItem => ({
    id: canvas.id,
    title: canvas.title || 'Neuer Canvas',
    date: canvas.updated_at,
    type: 'canvas',
    href: `/studio/canvas/${canvas.id}`,
    // Omitted rather than null: `exactOptionalPropertyTypes` is on, and
    // RecentItemsSection falls back to a tinted icon plate when it is absent.
    ...(canvas.thumbnail_url ? { thumbnailUrl: canvas.thumbnail_url } : {}),
  }));
  return [...shareItems, ...canvasItems].sort(byDateDesc);
}

export function toKiImageItems(shares: Share[]): RecentItem[] {
  return shares
    .filter((share) => isKiImage(share))
    .map(shareToItem)
    .sort(byDateDesc);
}

export function toReelItems(projects: Project[]): RecentItem[] {
  return projects
    .map((project): RecentItem => ({
      id: project.id,
      title: project.title || 'Ohne Titel',
      // The ordering key the backend feed uses for reels, too.
      date: project.last_edited_at || project.created_at,
      type: 'video',
      href: `/studio/video?project=${project.id}`,
      ...(project.thumbnail_path
        ? { thumbnailUrl: `/api/subtitler/projects/${project.id}/thumbnail` }
        : {}),
    }))
    .sort(byDateDesc);
}
