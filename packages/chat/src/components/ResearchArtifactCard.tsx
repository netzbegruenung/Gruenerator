'use client';

import { Button } from '@gruenerator/ui';
import {
  BookOpen,
  FileText,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { makeCitationComponents } from '../lib/citationMarkdownComponents';
import { escapeCitationMarkers } from '../lib/citationProcessing';
import { cn } from '../lib/utils';
import {
  getString,
  getArray,
  extractHeadings,
  extractFirstParagraph,
  buildExportMarkdown,
  researchCitationToSerializable,
  type ResearchCitation,
} from '../lib/toolResults';

import { CitationList } from './tool-ui/citation';

const remarkPlugins = [remarkGfm];

type Citation = ResearchCitation;

interface ResearchArtifactCardProps {
  query: string;
  result: unknown;
}

const CONFIDENCE_LABELS = {
  high: 'Hohe Konfidenz',
  medium: 'Mittlere Konfidenz',
  low: 'Niedrige Konfidenz',
} as const;

const CONFIDENCE_COLORS = {
  high: 'text-status-green',
  medium: 'text-status-yellow',
  low: 'text-status-red',
} as const;

export const ResearchArtifactCard = memo(function ResearchArtifactCard({
  query,
  result,
}: ResearchArtifactCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const answer = getString(result, 'answer');
  const citations = (getArray(result, 'citations') as Citation[] | null) ?? [];
  const confidence = getString(result, 'confidence');

  const headings = useMemo(() => extractHeadings(answer ?? ''), [answer]);
  const previewText = useMemo(() => extractFirstParagraph(answer ?? ''), [answer]);

  const citationMap = useMemo(
    () =>
      new Map(
        citations.map((c) => [
          c.id,
          {
            id: c.id,
            title: c.title,
            url: c.url,
            snippet: c.snippet,
            domain: c.domain,
            source: 'research',
          },
        ])
      ),
    [citations]
  );
  const markdownComponents = useMemo(() => makeCitationComponents(citationMap), [citationMap]);
  const escapedAnswer = useMemo(() => (answer ? escapeCitationMarkers(answer) : ''), [answer]);

  const handleExport = async () => {
    if (isExporting || !answer) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const exportContent = buildExportMarkdown(query, answer, citations);
      const exportTitle = query ? `Recherche: ${query.slice(0, 80)}` : 'Recherche';
      const { onEditInDocs, fetch: configFetch, endpoints } = useChatConfigStore.getState();
      if (onEditInDocs) {
        await onEditInDocs(exportContent, exportTitle);
        return;
      }
      const response = await configFetch(endpoints.exportToDocs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: exportContent,
          title: exportTitle,
          documentType: 'chat-response',
        }),
      });
      if (!response.ok) throw new Error('Export fehlgeschlagen');
      const data = (await response.json()) as { documentId?: string };
      if (data.documentId)
        window.open(`/office/${data.documentId}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    } finally {
      setIsExporting(false);
    }
  };

  if (!answer && citations.length === 0) {
    return (
      <div className="border-section-border my-2 rounded-xl border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="text-secondary-700 h-4 w-4" />
          <span className="font-medium">Deep Research</span>
        </div>
        <p className="text-foreground-muted mt-2 text-xs">Keine Recherche-Ergebnisse</p>
      </div>
    );
  }

  return (
    <div className="border-section-border my-2 overflow-hidden rounded-xl border bg-surface">
      <button
        type="button"
        onClick={() => setIsCollapsed((c) => !c)}
        aria-expanded={!isCollapsed}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
      >
        <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
          <BookOpen className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-foreground shrink-0 text-sm font-bold">Deep Research</span>
          {query && (
            <span className="text-foreground-muted truncate text-[13px]">
              &bdquo;{query}&ldquo;
            </span>
          )}
        </span>
        <span className="text-foreground-muted flex shrink-0 items-center gap-2 text-[11px]">
          {confidence && CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS] && (
            <span
              className={`hidden items-center gap-1 sm:flex ${CONFIDENCE_COLORS[confidence as keyof typeof CONFIDENCE_COLORS] ?? 'text-grey-500'}`}
            >
              <Sparkles className="h-3 w-3" />
              {CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS]}
            </span>
          )}
          {citations.length > 0 && (
            <span className="hidden sm:inline">{citations.length} Quellen</span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')}
          />
        </span>
      </button>

      {!isCollapsed && (
        <>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {!isExpanded && (
              <>
                {headings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {headings.map((h, i) => (
                      <span
                        key={i}
                        className="text-foreground-muted bg-background-alt rounded-full px-2.5 py-1 text-xs"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                {previewText && (
                  <div className="text-foreground line-clamp-3 text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                      {escapeCitationMarkers(previewText)}
                    </ReactMarkdown>
                  </div>
                )}
              </>
            )}

            {isExpanded && answer && (
              <div className="text-foreground text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                  {escapedAnswer}
                </ReactMarkdown>
              </div>
            )}
          </div>

          <div className="border-section-border flex flex-wrap items-center gap-1 border-t px-3 py-2">
            {answer && (
              <Button variant="brand-ghost" size="sm" onClick={() => setIsExpanded((x) => !x)}>
                {isExpanded ? (
                  <>
                    <ChevronUp /> Einklappen
                  </>
                ) : (
                  <>
                    <ChevronDown /> Vollständig anzeigen
                  </>
                )}
              </Button>
            )}
            {answer && (
              <Button variant="ghost" size="sm" onClick={handleExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="animate-spin" /> : <FileText />}
                Als Dokument speichern
              </Button>
            )}
            {exportError && (
              <span className="text-status-red w-full text-xs sm:w-auto">{exportError}</span>
            )}
          </div>

          {citations.length > 0 && (
            <div className="border-section-border border-t">
              <button
                onClick={() => setShowSources((s) => !s)}
                className="text-foreground-muted hover:bg-primary/5 flex w-full items-center gap-1.5 px-4 py-1.5 text-[11px] transition-colors"
                type="button"
                aria-expanded={showSources}
              >
                {showSources ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>
                  {citations.length} Quelle{citations.length === 1 ? '' : 'n'}
                </span>
              </button>
              {showSources && (
                <div className="min-w-0 px-4 pb-3 [&_*]:text-[11px]">
                  <CitationList
                    id="research-citations"
                    citations={citations.map((c) => researchCitationToSerializable(c))}
                    variant="default"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});
