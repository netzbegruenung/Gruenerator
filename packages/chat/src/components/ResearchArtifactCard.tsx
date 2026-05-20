'use client';

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

import { CitationList } from './tool-ui/citation';
import type { SerializableCitation } from './tool-ui/citation/schema';

const remarkPlugins = [remarkGfm];

interface Citation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

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
      if (data.documentId) window.open(`/docs/${data.documentId}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    } finally {
      setIsExporting(false);
    }
  };

  if (!answer && citations.length === 0) {
    return (
      <div className="border-section-border my-2 rounded-lg border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="text-secondary-700 h-4 w-4" />
          <span className="font-medium">Deep Research</span>
        </div>
        <p className="text-foreground-muted mt-2 text-xs">Keine Recherche-Ergebnisse</p>
      </div>
    );
  }

  return (
    <div className="border-section-border my-2 overflow-hidden rounded-lg border bg-surface">
      <div className="border-section-border flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b p-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="text-secondary-700 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground text-sm font-medium">Deep Research</div>
            {query && (
              <div className="text-foreground-muted truncate text-xs">&bdquo;{query}&ldquo;</div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          {confidence && CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS] && (
            <span
              className={`flex items-center gap-1 ${CONFIDENCE_COLORS[confidence as keyof typeof CONFIDENCE_COLORS] ?? 'text-grey-500'}`}
            >
              <Sparkles className="h-3 w-3" />
              {CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS]}
            </span>
          )}
          {citations.length > 0 && (
            <span className="text-foreground-muted">&middot; {citations.length} Quellen</span>
          )}
        </div>
      </div>

      <div className="p-3">
        {!isExpanded && (
          <>
            {headings.length > 0 && (
              <div className="text-foreground-muted mb-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                {headings.map((h, i) => (
                  <span key={i}>
                    <span className="font-medium">##</span> {h}
                    {i < headings.length - 1 && <span className="ml-2">&middot;</span>}
                  </span>
                ))}
              </div>
            )}
            {previewText && (
              <div className="text-foreground text-sm leading-relaxed">
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

      <div className="bg-surface-2 border-section-border flex flex-wrap items-center gap-2 border-t p-2">
        {answer && (
          <button
            onClick={() => setIsExpanded((x) => !x)}
            className="text-foreground hover:bg-primary/10 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors"
            type="button"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Einklappen
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Vollständig anzeigen
              </>
            )}
          </button>
        )}
        {answer && (
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="text-foreground hover:bg-primary/10 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
            type="button"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            Als Dokument speichern
          </button>
        )}
        {exportError && (
          <span className="text-status-red w-full text-xs sm:w-auto">{exportError}</span>
        )}
      </div>

      {citations.length > 0 && (
        <div className="border-section-border border-t">
          <button
            onClick={() => setShowSources((s) => !s)}
            className="text-foreground-muted hover:bg-primary/5 flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
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
            <div className="min-w-0 px-3 pb-3 [&_*]:text-[11px]">
              <CitationList
                id="research-citations"
                citations={citations.map((c) => toSerializableCitation(c))}
                variant="default"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function extractHeadings(markdown: string): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) out.push(m[1].trim());
    if (out.length >= 6) break;
  }
  return out;
}

function extractFirstParagraph(markdown: string): string {
  if (!markdown) return '';
  // Skip leading headings / blank lines, return first non-heading paragraph.
  const lines = markdown.split('\n');
  const buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buf.length > 0) break;
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(trimmed);
    if (buf.join(' ').length > 240) break;
  }
  const para = buf.join(' ');
  return para.length > 280 ? para.slice(0, 280) + '…' : para;
}

function buildExportMarkdown(query: string, answer: string, citations: Citation[]): string {
  const lines: string[] = [];
  if (query) {
    lines.push(`# Recherche: ${query}`, '');
  }
  lines.push(answer);
  if (citations.length > 0) {
    lines.push('', '## Quellen', '');
    for (const c of citations) {
      lines.push(`- [${c.id}] [${c.title}](${c.url}) — ${c.domain}`);
    }
  }
  return lines.join('\n');
}

function toSerializableCitation(c: Citation): SerializableCitation {
  return {
    type: 'document',
    id: String(c.id),
    title: c.title,
    href: c.url,
    ...(c.snippet ? { snippet: c.snippet } : {}),
    ...(c.domain ? { domain: c.domain } : {}),
    ...(c.domain ? { favicon: `https://www.google.com/s2/favicons?domain=${c.domain}&sz=32` } : {}),
  };
}

function getString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  }
  return null;
}

function getArray(obj: unknown, key: string): unknown[] | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? val : null;
  }
  return null;
}
