'use client';

import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { memo, useState } from 'react';

import { type SearchImage } from '../../hooks/useChatGraphStream';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';

/**
 * Image hits from the web search.
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
 * configured — the entry falls back to the plain link it was before. The fallback
 * is not a nicety: it is what keeps the rule true when the proxy is off.
 *
 * The second reason for the restraint is legal, and it is why the heading says
 * "gefundene Bildquellen": a web image is research context ("that is what the
 * poster looked like"), not licensed material. The note underneath says so, and
 * nothing here routes an image into the sharepic/social path.
 */
export const SearchImagesSection = memo(function SearchImagesSection({
  images,
}: {
  images: SearchImage[];
}) {
  if (images.length === 0) return null;

  // One decision for the whole block rather than per item: a half-grid,
  // half-list section reads as broken rather than as degraded.
  const canShowThumbnails = images.some((image) => image.proxyUrl);

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <div className="flex items-center gap-1.5 px-1 mb-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">
          {images.length} gefundene {images.length === 1 ? 'Bildquelle' : 'Bildquellen'}
        </span>
      </div>

      {canShowThumbnails ? (
        <ul className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-3">
          {images.map((image) => (
            <ImageTile key={image.url} image={image} />
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 pl-1">
          {images.map((image) => (
            <li key={image.url}>
              <ImageLink image={image} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 px-1.5 text-[10px] leading-snug text-foreground-muted">
        Gefundene Bilder sind Recherchematerial — die Rechte liegen bei den Urheber*innen. Für
        eigene Grafiken die Bildgenerierung nutzen.
      </p>
    </div>
  );
});

/**
 * One thumbnail, with the link as its failure mode.
 *
 * The proxy can fail for ordinary reasons — the source 404s, the file is bigger
 * than the cap, the type is not one we serve — and a broken-image icon would
 * leave the user with nothing. On error the tile becomes the same link the
 * no-proxy path renders, so the source stays reachable either way.
 */
const ImageTile = memo(function ImageTile({ image }: { image: SearchImage }) {
  const [failed, setFailed] = useState(false);

  if (!image.proxyUrl || failed) {
    return (
      <li className="col-span-1">
        <ImageLink image={image} />
      </li>
    );
  }

  return (
    <li>
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block overflow-hidden rounded-md border border-border/50 transition-colors hover:border-foreground/25"
        title={`${image.title} — ${image.domain}`}
      >
        <img
          // Same-origin path only. Never `image.url` — see the file comment.
          src={image.proxyUrl}
          alt={image.title}
          loading="lazy"
          decoding="async"
          // Belt and braces: even same-origin, nothing here should carry a
          // referrer onward if the proxy ever redirected.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-24 w-full bg-muted object-cover"
        />
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <SourceGlyph domain={image.domain} size={12} />
          <span className="line-clamp-1 flex-1 text-[10px] text-foreground-muted group-hover:text-foreground">
            {image.domain}
          </span>
        </div>
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
      className="group flex items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground-muted hover:bg-muted hover:text-foreground transition-colors"
    >
      <SourceGlyph domain={image.domain} size={14} />
      <span className="line-clamp-1 flex-1">{image.title}</span>
      <span className="flex-shrink-0 text-[10px] opacity-70">{image.domain}</span>
      <ExternalLink
        className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-70 transition-opacity"
        aria-hidden="true"
      />
    </a>
  );
});
