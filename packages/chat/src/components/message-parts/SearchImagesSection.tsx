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
 * The second reason for the restraint is legal, and it is why the note under the
 * grid says what it says: a web image is research context ("that is what the
 * poster looked like"), not licensed material. Nothing here routes an image into
 * the sharepic/social path.
 *
 * It renders directly under the answer, NOT inside the sources disclosure. A
 * source backs a claim and belongs behind a chevron; these ARE the result — they
 * only ever arrive on a turn that asked to see pictures. Inside the disclosure an
 * image-only turn had no way to open at all: its `citations` are empty, and the
 * action row renders no "Quellen" trigger without them.
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
    <section className="mt-4 w-full">
      <div className="mb-2 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-foreground-muted" aria-hidden="true" />
        {/* "Bildquellen", not "Bilder": the noun frames them as references even
            now that they are visible, which is the same reason the note below
            exists. A deliberate wording — see the file comment. */}
        <span className="text-xs font-medium text-foreground">
          {images.length} gefundene {images.length === 1 ? 'Bildquelle' : 'Bildquellen'}
        </span>
      </div>

      {canShowThumbnails ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <ImageTile key={image.url} image={image} />
          ))}
        </ul>
      ) : (
        <ul className="space-y-1">
          {images.map((image) => (
            <li key={image.url}>
              <ImageLink image={image} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-snug text-foreground-muted">
        Recherchematerial — die Rechte liegen bei den Urheber*innen. Für eigene Grafiken die
        Bildgenerierung nutzen.
      </p>
    </section>
  );
});

/**
 * One thumbnail, with the link as its failure mode.
 *
 * The proxy can fail for ordinary reasons — the source 404s, the file is bigger
 * than the cap, the type is not one we serve — and a broken-image icon would
 * leave the user with nothing. On error the tile becomes the same link the
 * no-proxy path renders, so the source stays reachable either way.
 *
 * `aspect-[4/3]` rather than a fixed pixel height: the tile keeps a photo's
 * proportions at every column count. The old fixed 96px turned a 240px-wide
 * desktop tile into a 2.5:1 letterbox, and `object-cover` then cropped the head
 * off every portrait.
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
        className="group block overflow-hidden rounded-lg bg-card ring-1 ring-border/60 transition-shadow hover:ring-2 hover:ring-primary/40"
        title={`${image.title} — ${image.domain}`}
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
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
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <SourceGlyph domain={image.domain} size={12} />
          <span className="line-clamp-1 flex-1 text-[11px] text-foreground-muted group-hover:text-foreground">
            {image.domain}
          </span>
          <ExternalLink
            className="h-3 w-3 flex-shrink-0 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-70"
            aria-hidden="true"
          />
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
