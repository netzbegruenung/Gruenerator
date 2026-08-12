'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { FileText } from 'lucide-react';
import { memo } from 'react';

import { useCitationPanel } from '../../context/CitationPanelContext';
import { getCollectionStyle } from '../../lib/collectionStyles';
import { CitationPreview } from '../tool-ui/citation/CitationPreview';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';
import { useHoverPopover } from '../tool-ui/citation/useHoverPopover';

import type { Citation } from '../../hooks/useChatGraphStream';

interface CitationBadgeProps {
  citationId: number;
  citation: Citation | undefined;
}

export const CitationBadge = memo(function CitationBadge({
  citationId,
  citation,
}: CitationBadgeProps) {
  const { open, setOpen, handleMouseEnter, handleMouseLeave } = useHoverPopover();
  const citationPanel = useCitationPanel();

  if (!citation) {
    // Numberless dot during streaming — the mid-stream IDs the LLM emits don't
    // match the post-stream first-mention renumbering, so we keep the inline box
    // (avoids reflow when chips swap in at done) but drop the digit.
    return (
      <sup
        aria-hidden="true"
        className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] bg-secondary-600/40 dark:bg-primary-400/40 rounded-full px-0.5 mx-0.5 align-super"
      />
    );
  }

  const collectionStyle = getCollectionStyle(citation.source);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold rounded-full px-0.5 mx-0.5 align-super cursor-pointer transition-opacity hover:opacity-80 bg-secondary-600 text-white dark:bg-primary-400 dark:text-grey-950"
          aria-label={`Quelle ${citationId}: ${citation.title}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {citationId}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-80 max-w-[90vw] p-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <CitationPreview
          icon={citation.domain ? <SourceGlyph domain={citation.domain} size={16} /> : undefined}
          domain={citation.domain}
          title={citation.title}
          url={citation.url || undefined}
          body={citation.citedText || citation.snippet}
          chip={
            citation.collectionName
              ? {
                  label: citation.collectionName,
                  bg: collectionStyle.bg,
                  color: collectionStyle.color,
                }
              : undefined
          }
          action={
            citation.documentId && citation.chunkIndex != null && citation.collectionId ? (
              <div className="flex justify-end">
                <button
                  className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground"
                  onClick={() => {
                    setOpen(false);
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
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
});
