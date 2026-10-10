import { resolveStoredImageUrl } from '@gruenerator/shared/media-library/shareUrl';
import { Badge, InteractiveCard } from '@gruenerator/ui';
import { Bookmark, ExternalLink, Heart, Image as ImageIcon } from 'lucide-react';
import { memo, useState, type JSX, type ReactNode } from 'react';

import { getTemplateFormat, ratioLabelFromSize } from './templateFormat';

import { cn } from '@/utils/cn';
import { resolveApiAssetUrl } from '@/utils/platform';

interface VorlagenCardItem {
  id: string | number;
  title?: string;
  template_type?: string;
  tags?: string[];
  thumbnail_url?: string;
  external_url?: string | null;
  download_url?: string;
  content_data?: { originalUrl?: string } | Record<string, unknown>;
  metadata?: unknown;
  likes_count?: number;
}

export interface VorlagenCardProps {
  item: VorlagenCardItem;
  /** Top-right overlay marker (e.g. "Community"). */
  badge?: ReactNode;
  /** Top-right overlay actions menu (e.g. the 3-dot dropdown on "Meine Vorlagen"). */
  menu?: ReactNode;
  onOpen: () => void;
  /** Opens the external/source URL directly (overlay action). Omitted when none exists. */
  onOpenExternal?: () => void;
  /** Whether the current user has liked this template. */
  liked?: boolean;
  /** Toggles the like (overlay action). Rendered only when provided. */
  onToggleLike?: () => void;
  /** Disables the like button while a toggle is in flight. */
  likeToggling?: boolean;
  /** Whether the current user has bookmarked („gemerkt") this Vorlage. */
  favorited?: boolean;
  /** Toggles the bookmark (overlay action). Rendered only when provided. */
  onToggleFavorite?: () => void;
  favoriteToggling?: boolean;
}

/**
 * Round, frosted overlay button on the thumbnail. Permanently visible rather
 * than hover-revealed, so touch users reach like/merken without a long-press, and
 * dark-on-image in both themes so it stays legible over any template artwork.
 *
 * Die Deckkraft ist gemessen, nicht geraten: das weiße Glyph erreicht auf der
 * Füllung über **jedem** Motiv mindestens 5,0:1 (Worst Case weißes Motiv, die
 * Füllung wird dort zu #6F7170) — das trägt WCAG 1.4.11. Die Ringkante selbst
 * verschwindet über mitteltonigen Motiven; das ist hingenommen, weil das Glyph
 * das Bedienelement identifiziert. **Nicht** die Deckkraft erhöhen, um die
 * Kante zu retten: über dunklen Motiven wird sie dadurch schlechter, nicht
 * besser. Geliked (primary-500) liegt bei 3,73:1 — Bestand, siehe variables.css.
 */
export const overlayAction =
  'flex size-[34px] items-center justify-center rounded-full border border-white/[0.16] ' +
  'bg-[#0f1210]/60 text-white backdrop-blur-sm ' +
  'transition-[transform,background-color] duration-150 ' +
  'hover:scale-110 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-60';

// Rückfall für Vorlagen, die der Server noch nicht vermessen hat
// (`metadata.thumbnail_size`): pro Thumbnail-URL einmal im Browser gemessen.
const measuredRatios = new Map<string, string>();

const storedRatio = (item: VorlagenCardItem): string | null => {
  const size = (
    item.metadata as { thumbnail_size?: { url?: string; width?: number; height?: number } } | null
  )?.thumbnail_size;
  if (!size || size.url !== item.thumbnail_url) return null;
  return ratioLabelFromSize(size.width ?? 0, size.height ?? 0);
};

/**
 * Gallery card for the Vorlagen-Datenbank. The thumbnail sits contained on a
 * square neutral stage — its own proportions carry the format, so nothing is
 * cropped and no synthetic aspect box is needed — with title, source tool and
 * format below.
 */
const VorlagenCard = memo(
  ({
    item,
    badge,
    menu,
    onOpen,
    onOpenExternal,
    liked = false,
    onToggleLike,
    likeToggling = false,
    favorited = false,
    onToggleFavorite,
    favoriteToggling = false,
  }: VorlagenCardProps): JSX.Element => {
    // Selbst hochgeladene Vorlagenbilder liegen als `/share/<token>` in der
    // Datenbank — die Seiten-URL, nicht die Datei. Ungefiltert liefert der
    // SPA-Fallback dafür HTML und die Kachel bleibt leer (#2845).
    const thumbnailUrl = resolveApiAssetUrl(resolveStoredImageUrl(item.thumbnail_url) ?? undefined);
    const stored = storedRatio(item);
    const [measured, setMeasured] = useState(() =>
      thumbnailUrl ? measuredRatios.get(thumbnailUrl) : undefined
    );
    const format = getTemplateFormat(item, stored ?? measured);
    const title = item.title || 'Unbenannte Vorlage';
    const likesCount = typeof item.likes_count === 'number' ? item.likes_count : 0;
    const hasOverlay = Boolean(badge || menu || onToggleLike || onToggleFavorite || onOpenExternal);

    const stop = (e: React.MouseEvent) => e.stopPropagation();

    return (
      <InteractiveCard
        label={title}
        onActivate={onOpen}
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border border-grey-200 bg-background text-left',
          'cursor-pointer transition-colors duration-150 hover:border-primary-500 dark:border-grey-700'
        )}
      >
        {/* Square neutral stage — the thumbnail is contained, never cropped. */}
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-background-alt">
          {thumbnailUrl ? (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad misst nur die Bildmaße, keine Bedienung
            <img
              src={thumbnailUrl}
              alt={title}
              loading="lazy"
              onLoad={(e) => {
                if (stored || measuredRatios.has(thumbnailUrl)) return;
                const { naturalWidth, naturalHeight } = e.currentTarget;
                const label = ratioLabelFromSize(naturalWidth, naturalHeight);
                if (!label) return;
                measuredRatios.set(thumbnailUrl, label);
                setMeasured(label);
              }}
              className="max-h-[88%] max-w-[88%] rounded-sm object-contain"
            />
          ) : (
            <ImageIcon className="size-8 text-grey-400" aria-hidden="true" />
          )}

          {hasOverlay && (
            // z-[2] statt `interactiveCardControl`: dessen `relative` würde das
            // `absolute` hier aufheben — Tailwind gibt `.relative` NACH `.absolute`
            // aus, gleiche Spezifität, also gewinnt das Falsche und die Knöpfe
            // rutschen aus der Ecke in den Bildfluss.
            <div className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-2">
              {badge != null && <span className="pointer-events-none">{badge}</span>}
              {onToggleLike && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onToggleLike();
                  }}
                  disabled={likeToggling}
                  className={cn(overlayAction, liked && 'bg-primary-500')}
                  aria-label={liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
                  aria-pressed={liked}
                  title={liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
                >
                  <Heart
                    className="size-4"
                    fill={liked ? 'currentColor' : 'none'}
                    stroke={liked ? 'none' : 'currentColor'}
                    aria-hidden="true"
                  />
                </button>
              )}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onToggleFavorite();
                  }}
                  disabled={favoriteToggling}
                  className={cn(overlayAction, favorited && 'bg-primary-500')}
                  aria-label="Merken"
                  aria-pressed={favorited}
                  title={favorited ? 'Gemerkt' : 'Merken'}
                >
                  <Bookmark
                    className="size-4"
                    fill={favorited ? 'currentColor' : 'none'}
                    stroke={favorited ? 'none' : 'currentColor'}
                    aria-hidden="true"
                  />
                </button>
              )}
              {onOpenExternal && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onOpenExternal();
                  }}
                  className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
                  aria-label="Vorlage öffnen"
                  title="Öffnen"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </button>
              )}
              {menu}
            </div>
          )}
        </div>

        {/* Meta row: name, then source tool + format. */}
        <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
          <h3
            className="truncate text-[0.9375rem] font-semibold text-foreground-heading"
            title={title}
          >
            {title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-grey-600 dark:text-grey-400">
            <Badge variant="outline">{format.tool}</Badge>
            <span>{format.formatLabel}</span>
            {likesCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1 font-medium"
                title={`${likesCount} mal geliked`}
              >
                <Heart className="size-3.5 shrink-0" aria-hidden="true" />
                {likesCount}
              </span>
            )}
          </div>
        </div>
      </InteractiveCard>
    );
  }
);

VorlagenCard.displayName = 'VorlagenCard';

export default VorlagenCard;
