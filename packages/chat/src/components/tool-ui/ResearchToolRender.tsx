'use client';

import { BookOpen, Loader2 } from 'lucide-react';
import { ResearchArtifactCard } from '../ResearchArtifactCard';
import { getToolQuery } from '../../lib/toolResults';

interface ResearchToolRenderProps {
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * Toolkit render for the `research` tool. Routes between two visual modes:
 *  - Loading: a richer in-flight card showing the question and a spinner +
 *    rolling status text (the orchestrator emits Plane → Suche → Vertiefe →
 *    Bericht via `search_start` events; the global ProgressIndicator on the
 *    message renders that copy above the toolCall).
 *  - Result: the ResearchArtifactCard with TOC preview, full report, and
 *    "Als Dokument speichern" export.
 *
 * Lives at toolkit-render level (not inside ToolCallUI) so the two modes
 * are SEPARATE component instances — avoids a hook-count mismatch when the
 * toolCall transitions from `call` to `result`.
 */
export function ResearchToolRender({ args, result }: ResearchToolRenderProps) {
  const query = getToolQuery(args) || '';

  if (result != null) {
    return <ResearchArtifactCard query={query} result={result} />;
  }

  return <ResearchLoadingCard query={query} />;
}

interface ResearchLoadingCardProps {
  query: string;
}

function ResearchLoadingCard({ query }: ResearchLoadingCardProps) {
  return (
    <div className="border-section-border bg-primary/5 my-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <BookOpen className="text-secondary-700 h-4 w-4 shrink-0" />
        <span className="text-foreground text-sm font-medium">Deep Research</span>
        <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
      </div>
      {query && (
        <div className="text-foreground-muted mt-1 text-xs">
          &bdquo;{query.length > 80 ? query.slice(0, 80) + '…' : query}&ldquo;
        </div>
      )}
      <div className="text-foreground-muted mt-2 text-[11px]">
        Plant Sub-Fragen, sucht parallel in Web &amp; Dokumenten, vertieft bei Lücken, synthetisiert
        Bericht. Dauert ca. 15&ndash;30s.
      </div>
    </div>
  );
}
