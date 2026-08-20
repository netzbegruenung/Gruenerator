import { cn } from '@gruenerator/ui';
import { memo } from 'react';

/**
 * Branded cover art for notebooks that have no designed webp — i.e. everything
 * a user created. Rebuilds the look of the shipped covers
 * (packages/shared/assets/notebook-covers/*.webp) in CSS so an arbitrary
 * notebook name gets the same tile as "Eigene Notebooks" or "Landesverbände":
 * the pink→lilac gradient with a soft bloom at the bottom, the name set in
 * GrueneType, white, top-left.
 *
 * Colours are sampled from notebook-neu.webp (600×600) at 0/30/55/78/100 % —
 * they are the design, not a token, and stay identical in dark mode because
 * the webp covers next to them cannot react to the theme either.
 */
const COVER_BACKGROUND =
  'radial-gradient(115% 80% at 30% 106%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 60%),' +
  'linear-gradient(177deg, #c1447a 0%, #c85684 30%, #c4728f 55%, #c095a8 78%, #cdb3bf 100%)';

// Type scale in container-query units, so a tile keeps its proportions whether
// it sits in the narrow scroll row or the wide "Eigene" grid.
const TITLE_SIZES = { xl: '17cqw', lg: '14cqw', md: '11cqw', sm: '8.6cqw' } as const;

/**
 * Pick the step that lets the name breathe: short names get poster-sized type,
 * long ones step down. A very long single word (German compounds) is capped at
 * `md` — hyphenation breaks it, but only if the fragments still fit the tile.
 */
function titleSize(title: string): string {
  const longestWord = title.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  if (longestWord >= 16) return TITLE_SIZES[title.length > 40 ? 'sm' : 'md'];
  if (title.length <= 13) return TITLE_SIZES.xl;
  if (title.length <= 22) return TITLE_SIZES.lg;
  if (title.length <= 40) return TITLE_SIZES.md;
  return TITLE_SIZES.sm;
}

export interface NotebookCoverArtProps {
  title: string;
  /** Small line at the bottom, e.g. the author of a community notebook. */
  subtitle?: string;
  /**
   * Set when the card carries a permanently visible top-right control (the like
   * button). The title then flows around a float the size of that control
   * instead of running underneath it — measured at 300/170/120 px tile widths,
   * where the button is a fixed ~44×26 px and eats a third of a mobile tile.
   */
  reserveTopRight?: boolean;
  className?: string;
}

const NotebookCoverArt = memo(
  ({ title, subtitle, reserveTopRight, className }: NotebookCoverArtProps) => (
    <div
      className={cn('relative size-full overflow-hidden', className)}
      // `container-type` is load-bearing, not decoration: the type scale below is
      // in `cqw`, so the tile keeps its proportions in the narrow scroll row and
      // in the wide grid alike. Both live in the same style object so neither can
      // be removed without the other.
      style={{ background: COVER_BACKGROUND, containerType: 'inline-size' }}
    >
      {/* Clipped by its own box rather than `line-clamp`: -webkit-box does not
          flow text around the float below. lang="de" is what makes
          `hyphens: auto` break German compounds. */}
      <p
        lang="de"
        className="absolute inset-x-[7%] bottom-[24%] top-[8%] m-0 overflow-hidden hyphens-auto break-words leading-[1.1] text-white"
        style={{ fontFamily: "'GrueneType', sans-serif", fontSize: titleSize(title), left: '10%' }}
      >
        {reserveTopRight && <span aria-hidden className="float-right h-7 w-12" />}
        {title}
      </p>
      {subtitle && (
        <p
          className="absolute bottom-[7%] right-[7%] m-0 truncate font-bold text-white/90"
          style={{ fontSize: '5.4cqw', left: '10%' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
);
NotebookCoverArt.displayName = 'NotebookCoverArt';

export default NotebookCoverArt;
