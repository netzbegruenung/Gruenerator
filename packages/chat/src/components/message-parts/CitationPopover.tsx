'use client';

import { memo, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { FileText } from 'lucide-react';
import type { Citation } from '../../hooks/useChatGraphStream';
import { cn } from '../../lib/utils';
import { getCollectionStyle } from '../../lib/collectionStyles';
import { useCitationPanel } from '../../context/CitationPanelContext';

interface CitationBadgeProps {
  citationId: number;
  citation: Citation | undefined;
}

export const CitationBadge = memo(function CitationBadge({
  citationId,
  citation,
}: CitationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const citationPanel = useCitationPanel();

  if (!citation) {
    return (
      <sup className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold bg-secondary-600 text-white dark:bg-primary-400 dark:text-grey-950 rounded-full px-0.5 mx-0.5 align-super">
        {citationId}
      </sup>
    );
  }

  const collectionStyle = getCollectionStyle(citation.source);

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold rounded-full px-0.5 mx-0.5 align-super cursor-pointer transition-opacity hover:opacity-80 bg-secondary-600 text-white dark:bg-primary-400 dark:text-grey-950"
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
              'z-50 w-80 max-w-[90vw] rounded-lg border border-border bg-card p-3 shadow-lg',
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
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary leading-tight hover:underline"
                      >
                        {citation.title}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {citation.title}
                      </p>
                    )}
                  </div>
                  {(citation.collectionName || citation.domain) && (
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
                      {citation.domain && (
                        <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-foreground-muted leading-relaxed">
                {citation.citedText || citation.snippet}
              </p>

              {citation.documentId && citation.chunkIndex != null && citation.collectionId && (
                <div className="flex justify-end">
                  <button
                    className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground"
                    onClick={() => {
                      setIsOpen(false);
                      citationPanel.open({
                        documentId: citation.documentId!,
                        documentTitle: citation.title || 'Dokument',
                        chunkIndex: citation.chunkIndex!,
                        collectionId: citation.collectionId!,
                        sourceUrl: citation.url || '',
                      });
                    }}
                    aria-label="Im Dokument lesen"
                    title="Im Dokument lesen"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <PopoverPrimitive.Arrow className="fill-card" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  );
});
