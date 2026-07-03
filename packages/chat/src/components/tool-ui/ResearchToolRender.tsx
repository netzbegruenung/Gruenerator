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
    <div className="border-section-border bg-primary/5 my-2 rounded-xl border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
          <BookOpen className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-foreground shrink-0 text-sm font-bold">Deep Research</span>
          {query && (
            <span className="text-foreground-muted truncate text-[13px]">
              &bdquo;{query.length > 80 ? query.slice(0, 80) + '…' : query}&ldquo;
            </span>
          )}
        </span>
        <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" />
      </div>
      <div className="text-foreground-muted mt-2 text-[11px]">
        Plant Sub-Fragen, sucht parallel in Web &amp; Dokumenten, vertieft bei Lücken, synthetisiert
        Bericht. Dauert ca. 15&ndash;30s.
      </div>
    </div>
  );
}
