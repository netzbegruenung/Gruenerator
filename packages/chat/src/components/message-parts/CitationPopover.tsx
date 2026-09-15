'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { Microscope, FileText } from 'lucide-react';
import { memo, useMemo } from 'react';

import { useCitationContext } from '../../context/CitationContext';
import { useCitationPanel, type CitationPanelSource } from '../../context/CitationPanelContext';
import { getCollectionStyle } from '../../lib/collectionStyles';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { CitationPreview } from '../tool-ui/citation/CitationPreview';
import { SourceGlyph } from '../tool-ui/citation/SourceGlyph';
import { useHoverPopover } from '../tool-ui/citation/useHoverPopover';

import type { Citation } from '../../hooks/useChatGraphStream';

/** Eine Zitation, die das Panel öffnen kann: sie braucht Dokument, Chunk und
 *  Sammlung, um den Originaltext zu holen. Die Felder sind auf dem Draht
 *  optional (nur Notebook-/Dokument-Zitationen setzen sie, siehe
 *  `chatCitationBase`), deshalb echt verengen statt behaupten. */
function toPanelSource(c: Citation): CitationPanelSource | null {
  if (typeof c.documentId !== 'string') return null;
  if (typeof c.collectionId !== 'string') return null;
  if (typeof c.chunkIndex !== 'number') return null;
  return {
    citationId: c.id,
    documentId: c.documentId,
    documentTitle: c.title || 'Dokument',
    chunkIndex: c.chunkIndex,
    collectionId: c.collectionId,
    sourceUrl: c.url || undefined,
    citedText: c.citedText,
    collectionName: c.collectionName,
    contentType: c.contentType,
  };
}

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
  const chunkInspectorHref = useChatConfigStore((s) => s.chunkInspectorHref);
  const { citations } = useCitationContext();

  // Das Panel blättert durch die Quellen DIESER Antwort, also reicht der Badge
  // die ganze öffenbare Liste weiter — das Panel hat keinen anderen Weg zu den
  // Geschwistern der angeklickten Quelle.
  const panelSources = useMemo(
    () => citations.map(toPanelSource).filter((s): s is CitationPanelSource => s !== null),
    [citations]
  );

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

  // documentId/collectionId/chunkIndex sind optionale Felder (nur bei
  // Notebook-/Dokument-Zitationen gesetzt, siehe chatCitationBase in
  // packages/contracts/src/schemas/chatStreamEvents.ts). Deshalb echt
  // verengen statt behaupten; das ersetzt zugleich die `!` unten.
  const documentId = typeof citation.documentId === 'string' ? citation.documentId : null;
  const collectionId = typeof citation.collectionId === 'string' ? citation.collectionId : null;
  const chunkIndex = typeof citation.chunkIndex === 'number' ? citation.chunkIndex : null;
  // Position dieser Zitation in der öffenbaren Liste; der Fuß des Panels
  // blättert darüber. Der Fallback auf 0 kann nicht greifen — die Bedingung
  // unten ist dasselbe Prädikat wie in `toPanelSource` — und hält den Index
  // trotzdem im gültigen Bereich.
  const panelIndex = Math.max(
    0,
    panelSources.findIndex((s) => s.citationId === citation.id)
  );
  const inspectorHref =
    documentId !== null && collectionId !== null && chunkIndex !== null && chunkInspectorHref
      ? chunkInspectorHref({ documentId, collectionId, chunkIndex })
      : null;

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
        className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[90vw] overflow-y-auto p-0"
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
            documentId !== null && collectionId !== null && chunkIndex !== null ? (
              <div className="flex justify-end gap-1">
                <button
                  className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground pointer-coarse:p-3"
                  onClick={() => {
                    setOpen(false);
                    citationPanel.open(panelSources, panelIndex);
                  }}
                  aria-label="Im Dokument lesen"
                  title="Im Dokument lesen"
                >
                  <FileText className="h-4 w-4" />
                </button>
                {inspectorHref && (
                  <a
                    href={inspectorHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground"
                    aria-label="Chunks ansehen"
                    title="Chunks ansehen"
                  >
                    <Microscope className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
});
