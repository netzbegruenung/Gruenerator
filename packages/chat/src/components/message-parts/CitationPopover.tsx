'use client';

import { memo, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { ExternalLink } from 'lucide-react';
import type { Citation } from '../../hooks/useChatGraphStream';
import { cn } from '../../lib/utils';
import { getCollectionStyle } from '../../lib/collectionStyles';

interface CitationBadgeProps {
  citationId: number;
  citation: Citation | undefined;
}

export const CitationBadge = memo(function CitationBadge({
  citationId,
  citation,
}: CitationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!citation) {
    return (
      <sup className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold bg-secondary-600 dark:bg-primary-400 text-white rounded-full px-0.5 mx-0.5 align-super">
        {citationId}
      </sup>
    );
  }

  const collectionStyle = getCollectionStyle(citation.source);

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold rounded-full px-0.5 mx-0.5 align-super cursor-pointer transition-opacity hover:opacity-80 bg-secondary-600 dark:bg-primary-400 text-white"
          aria-label={`Quelle ${citationId}: ${citation.title}`}
        >
          {citationId}
        </button>
      </PopoverPrimitive.Trigger>
      {isOpen && (
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="top"
            sideOffset={4}
            align="center"
            className={cn(
              'z-50 w-72 rounded-lg border border-border bg-card p-3 shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
            )}
          >
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {citation.domain && (
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(citation.domain)}&sz=16`}
                        alt=""
                        width={16}
                        height={16}
                        className="flex-shrink-0"
                        loading="lazy"
                      />
                    )}
                    <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                      {citation.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {citation.collectionName && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: collectionStyle.bg,
                          color: collectionStyle.color,
                        }}
                      >
                        {citation.collectionName}
                      </span>
                    )}
                    {citation.contentType && (
                      <span className="text-[10px] text-foreground-muted italic">
                        {citation.contentType}
                      </span>
                    )}
                    {citation.domain && (
                      <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
                    )}
                    {citation.chunkIndex != null && (
                      <span className="text-[10px] text-foreground-muted">
                        Abschn. {citation.chunkIndex}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-foreground-muted leading-relaxed line-clamp-4">
                {citation.citedText || citation.snippet}
              </p>

              <div className="flex items-center gap-3">
                {citation.url && (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Quelle öffnen
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {citation.collectionId && citation.citedText && (
                  <button
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setIsOpen(false);
                      // Expand collapsed sources section first
                      document.dispatchEvent(new Event('citation-expand-sources'));
                      // Wait for DOM update, then scroll to the source card
                      requestAnimationFrame(() => {
                        const sourceCard = document.getElementById(`source-card-${citationId}`);
                        if (sourceCard) {
                          sourceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          sourceCard.querySelector('button')?.click();
                        }
                      });
                    }}
                  >
                    Mehr anzeigen
                  </button>
                )}
              </div>
            </div>
            <PopoverPrimitive.Arrow className="fill-card" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  );
});
