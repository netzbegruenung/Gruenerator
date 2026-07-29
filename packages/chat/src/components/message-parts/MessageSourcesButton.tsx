'use client';

import { memo, useMemo } from 'react';

import { type Citation } from '../../hooks/useChatGraphStream';
import { extractDomain } from '../../lib/urlUtils';
import { cn } from '../../lib/utils';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';

/** How many glyphs the stack shows before it stops growing. */
const MAX_GLYPHS = 3;

interface MessageSourcesButtonProps {
  citations: Citation[];
  open: boolean;
  onToggle: () => void;
}

/**
 * The "Quellen" control that lives INSIDE the message action row, next to copy
 * and regenerate — not on a line of its own above them.
 *
 * One citation per document is what the stack shows: retrieval routinely
 * returns four chunks of the same paper, and four identical monograms would
 * read as four sources.
 */
export const MessageSourcesButton = memo(function MessageSourcesButton({
  citations,
  open,
  onToggle,
}: MessageSourcesButtonProps) {
  const glyphs = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; domain: string | undefined }[] = [];
    for (const c of citations) {
      const domain = c.domain || extractDomain(c.url);
      // Sources without a URL (Wolke files, notebook documents) can only be
      // told apart by their document id or title.
      const key = c.documentId || domain || c.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({ key, domain });
      if (result.length === MAX_GLYPHS) break;
    }
    return result;
  }, [citations]);

  if (citations.length === 0) return null;

  return (
    <button
      onClick={onToggle}
      className={cn(
        'ml-2 flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs',
        'text-foreground-muted transition-colors hover:bg-primary/10 hover:text-foreground',
        open && 'text-foreground'
      )}
      aria-expanded={open}
      aria-label={`${citations.length} Quellen ${open ? 'ausblenden' : 'anzeigen'}`}
    >
      <span className="flex items-center">
        {glyphs.map((glyph, i) => (
          <SourceGlyph
            key={glyph.key}
            domain={glyph.domain}
            size={20}
            rounded="rounded-full"
            className={cn('rounded-full ring-2 ring-background', i > 0 && '-ml-2')}
          />
        ))}
      </span>
      <span>Quellen</span>
    </button>
  );
});
