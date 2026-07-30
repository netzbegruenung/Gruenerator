'use client';

import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { memo } from 'react';

import { type SearchImage } from '../../hooks/useChatGraphStream';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';

/**
 * Image hits from the web search — as NAMED LINKS, deliberately not thumbnails.
 *
 * The missing `<img>` is the whole design. Rendering one would make the reader's
 * browser fetch a file from whatever host the search turned up, which is the exact
 * pattern removed from the citation glyphs: a favicon request that reported the
 * user's IP and the page they were about to open to a third party, on a product
 * that advertises EU hosting. An arbitrary search-result host is a worse version
 * of that trade, not a better one. A backend image proxy would change the
 * calculus; until one exists, these are links.
 *
 * The second reason is legal rather than technical, and it is why the wording says
 * "gefundene Bilder" and not "Bilder": a web image is research context ("that is
 * what the poster looked like"), not licensed material. Showing it as a picture
 * inside our own UI invites it to be treated as usable, which for a party's public
 * communication is the expensive mistake.
 */
export const SearchImagesSection = memo(function SearchImagesSection({
  images,
}: {
  images: SearchImage[];
}) {
  if (images.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <div className="flex items-center gap-1.5 px-1 mb-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">
          {images.length} gefundene {images.length === 1 ? 'Bildquelle' : 'Bildquellen'}
        </span>
      </div>
      <ul className="space-y-1 pl-1">
        {images.map((image) => (
          <li key={image.url}>
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
          </li>
        ))}
      </ul>
      <p className="mt-1.5 px-1.5 text-[10px] leading-snug text-foreground-muted">
        Gefundene Bilder sind Recherchematerial — die Rechte liegen bei den Urheber*innen. Für
        eigene Grafiken die Bildgenerierung nutzen.
      </p>
    </div>
  );
});
