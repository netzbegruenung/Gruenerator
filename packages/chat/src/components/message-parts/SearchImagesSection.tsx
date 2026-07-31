'use client';

import { ExternalLink, Image as ImageIcon, Images } from 'lucide-react';
import { memo, useState } from 'react';

import { type SearchImage } from '../../hooks/useChatGraphStream';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';

/**
 * Image hits from the web search, as the mosaic that opens the answer.
 *
 * THE RULE THAT GOVERNS THIS FILE: the reader's browser must never request
 * anything from the source host. Rendering `<img src={image.url}>` would do
 * exactly that — announcing their IP, and the page they are reading, to whoever
 * runs a host that a search engine happened to return. That is the pattern we
 * removed from the citation glyphs (favicons fetched from Google) and it must not
 * come back here.
 *
 * So a thumbnail is shown ONLY through `proxyUrl`, a same-origin path served by
 * our own backend. When the backend supplies no `proxyUrl` — no signing secret
 * configured — the whole block falls back to a plain list of links. The fallback
 * is not a nicety: it is what keeps the rule true when the proxy is off.
 *
 * The second reason for the restraint is legal, and it is why the heading says
 * "Bildquellen" and the note says what it says: a web image is research context
 * ("that is what she looked like"), not licensed material. Nothing here routes an
 * image into the sharepic/social path.
 *
 * It renders ABOVE the answer, not inside the sources disclosure. A source backs a
 * claim and belongs behind a chevron; these are the first thing the answer shows.
 * Inside the disclosure they were unreachable on an image-only turn, which has no
 * citations and therefore no "Quellen" trigger to open.
 */

/** Tiles in the mosaic before the rest goes behind the counter. */
const MOSAIC_TILES = 3;

export const SearchImagesSection = memo(function SearchImagesSection({
  images,
}: {
  images: SearchImage[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (images.length === 0) return null;

  // One decision for the whole block rather than per item: a half-mosaic,
  // half-list section reads as broken rather than as degraded.
  const canShowThumbnails = images.some((image) => image.proxyUrl);

  if (!canShowThumbnails) {
    return (
      <Frame count={images.length}>
        <ul className="space-y-1">
          {images.map((image) => (
            <li key={image.url}>
              <ImageLink image={image} />
            </li>
          ))}
        </ul>
      </Frame>
    );
  }

  const visible = expanded ? images : images.slice(0, MOSAIC_TILES);
  const hidden = images.length - visible.length;
  const isMosaic = !expanded && visible.length >= MOSAIC_TILES;

  return (
    <Frame count={images.length}>
      <ul
        className={
          isMosaic
            ? 'grid aspect-[3/2] grid-cols-5 grid-rows-2 gap-1 overflow-hidden rounded-xl'
            : expanded || visible.length > 1
              ? 'grid grid-cols-2 gap-1 overflow-hidden rounded-xl sm:grid-cols-3'
              : 'overflow-hidden rounded-xl'
        }
      >
        {visible.map((image, i) => (
          <ImageTile
            key={image.url}
            image={image}
            // The big one, top-left. Only in the mosaic — an expanded grid gives
            // every hit the same weight, because at that point the user asked to
            // see them all rather than to be shown a highlight.
            className={isMosaic ? (i === 0 ? 'col-span-3 row-span-2' : 'col-span-2') : undefined}
            square={!isMosaic && visible.length > 1}
            {...(hidden > 0 && i === visible.length - 1
              ? { moreCount: hidden, onMore: () => setExpanded(true) }
              : {})}
          />
        ))}
      </ul>
    </Frame>
  );
});

/**
 * Heading and rights note — the two parts that must not depend on which of the
 * three render modes is showing. The note is the operative statement, so it sits
 * outside the branches rather than being repeated in each of them.
 */
const Frame = memo(function Frame({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 w-full">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-foreground-muted" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">
          {count} gefundene {count === 1 ? 'Bildquelle' : 'Bildquellen'}
        </span>
      </div>

      {children}

      <p className="mt-1.5 text-[11px] leading-snug text-foreground-muted">
        Recherchematerial — die Rechte liegen bei den Urheber*innen. Für eigene Grafiken die
        Bildgenerierung nutzen.
      </p>
    </section>
  );
});

/**
 * One tile, with the link as its failure mode.
 *
 * The proxy can fail for ordinary reasons — the source 404s, the file is bigger
 * than the cap, the type is not one we serve — and a broken-image icon would leave
 * the user with nothing. On error the tile becomes the same link the no-proxy path
 * renders, so the source stays reachable either way.
 *
 * A tile carrying `moreCount` is a BUTTON, not a link: it opens the rest of the
 * set. Putting the counter inside an `<a>` would nest a button in a link, and the
 * two would race for the same click.
 */
const ImageTile = memo(function ImageTile({
  image,
  className,
  square,
  moreCount,
  onMore,
}: {
  image: SearchImage;
  className?: string;
  square?: boolean;
  moreCount?: number;
  onMore?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!image.proxyUrl || failed) {
    return (
      <li className={className}>
        <ImageLink image={image} />
      </li>
    );
  }

  const picture = (
    <img
      // Same-origin path only. Never `image.url` — see the file comment.
      src={image.proxyUrl}
      alt={image.title}
      loading="lazy"
      decoding="async"
      // Belt and braces: even same-origin, nothing here should carry a referrer
      // onward if the proxy ever redirected.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  );

  const shell = square ? 'aspect-[4/3] w-full' : 'h-full w-full';

  if (moreCount != null && onMore) {
    return (
      <li className={className}>
        <button
          type="button"
          onClick={onMore}
          className={`group relative block overflow-hidden bg-muted ${shell}`}
          aria-label={`${moreCount} weitere Bildquellen anzeigen`}
        >
          {picture}
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
            <Images className="h-3 w-3" aria-hidden="true" />
            {moreCount}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className={className}>
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group block overflow-hidden bg-muted ${shell}`}
        title={`${image.title} — ${image.domain}`}
      >
        {picture}
      </a>
    </li>
  );
});

const ImageLink = memo(function ImageLink({ image }: { image: SearchImage }) {
  return (
    <a
      href={image.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground-muted transition-colors hover:bg-muted hover:text-foreground"
    >
      <SourceGlyph domain={image.domain} size={14} />
      <span className="line-clamp-1 flex-1">{image.title}</span>
      <span className="flex-shrink-0 text-[10px] opacity-70">{image.domain}</span>
      <ExternalLink
        className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-70"
        aria-hidden="true"
      />
    </a>
  );
});
