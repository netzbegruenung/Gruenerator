'use client';

import { Search, User, Image, Globe, Loader2, ChevronRight, ExternalLink, BookOpen, Sparkles, MessageCircle } from 'lucide-react';
import { useState, memo, useMemo, Fragment } from 'react';

interface ToolCallUIProps {
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

const TOOL_CONFIG: Record<string, { icon: typeof Search; label: string; color: string }> = {
  gruenerator_search: { icon: Search, label: 'Dokumente', color: 'text-emerald-600' },
  gruenerator_person_search: { icon: User, label: 'Person', color: 'text-blue-600' },
  gruenerator_examples_search: { icon: Image, label: 'Beispiele', color: 'text-purple-600' },
  web_search: { icon: Globe, label: 'Web', color: 'text-orange-600' },
  research: { icon: BookOpen, label: 'Recherche', color: 'text-indigo-600' },
};

export const ToolCallUI = memo(function ToolCallUI({ toolName, args, state, result }: ToolCallUIProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLoading = state === 'call' || state === 'partial-call';
  const config = TOOL_CONFIG[toolName] || { icon: Search, label: toolName, color: 'text-gray-600' };
  const Icon = config.icon;

  const query = useMemo(() => {
    const q = getString(args, 'query') || getString(args, 'question');
    return q ? (q.length > 60 ? q.slice(0, 60) + '...' : q) : null;
  }, [args]);

  const resultCount = useMemo(() => {
    if (!result || state !== 'result') return 0;
    const citations = getArray(result, 'citations');
    if (citations) return citations.length;
    const arr = getArray(result, 'results') || getArray(result, 'examples');
    if (arr) return arr.length;
    if (Array.isArray(result)) return result.length;
    if (getObject(result, 'person')) return 1;
    return 0;
  }, [result, state]);

  return (
    <div className="my-1.5 text-sm">
      <button
        onClick={() => state === 'result' && setIsExpanded(!isExpanded)}
        disabled={state !== 'result'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
          state === 'result'
            ? 'bg-primary/5 hover:bg-primary/10 cursor-pointer'
            : 'bg-gray-100 dark:bg-white/5'
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
        )}
        <span className="font-medium text-foreground">{config.label}</span>
        {query && (
          <span className="text-foreground-muted max-w-[200px] truncate">
            &bdquo;{query}&ldquo;
          </span>
        )}
        {state === 'result' && resultCount > 0 && (
          <>
            <span className="text-foreground-muted">&middot;</span>
            <span className="text-primary font-medium">{resultCount}</span>
            <ChevronRight className={`h-3.5 w-3.5 text-foreground-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </>
        )}
      </button>

      {isExpanded && state === 'result' && result != null && (
        <div className="mt-2 ml-2 border-l-2 border-primary/20 pl-3">
          <ToolResultRenderer toolName={toolName} result={result} />
        </div>
      )}
    </div>
  );
});

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

function getObject(obj: unknown, key: string): Record<string, unknown> | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return val && typeof val === 'object' && !Array.isArray(val) ? val as Record<string, unknown> : null;
  }
  return null;
}

function getBoolean(obj: unknown, key: string): boolean {
  if (obj && typeof obj === 'object' && key in obj) {
    return !!(obj as Record<string, unknown>)[key];
  }
  return false;
}

const ToolResultRenderer = memo(function ToolResultRenderer({ toolName, result }: { toolName: string; result: unknown }) {
  if (!result) {
    return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;
  }

  const error = getString(result, 'error');
  if (error) {
    return <p className="text-xs text-red-500">{error}</p>;
  }

  switch (toolName) {
    case 'gruenerator_search':
      return <CompactSearchResults results={getArray(result, 'results') || (Array.isArray(result) ? result : [])} />;
    case 'gruenerator_person_search':
      return <CompactPersonResult result={result} />;
    case 'gruenerator_examples_search':
      return <CompactExampleResults results={getArray(result, 'examples') || getArray(result, 'results') || (Array.isArray(result) ? result : [])} />;
    case 'web_search':
      return <CompactWebResults result={result} />;
    case 'research':
      return <ResearchResultUI result={result} />;
    default:
      return (
        <pre className="overflow-x-auto text-xs bg-gray-50 dark:bg-white/5 p-2 rounded">
          {JSON.stringify(result, null, 2)}
        </pre>
      );
  }
});

const CompactSearchResults = memo(function CompactSearchResults({ results }: { results: unknown[] }) {
  if (!results.length) return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;

  return (
    <div className="space-y-1.5">
      {results.slice(0, 5).map((item, i) => {
        const source = getString(item, 'source');
        const excerpt = getString(item, 'excerpt');
        const url = getString(item, 'url');
        const relevance = getString(item, 'relevance');

        return (
          <div key={i} className="text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{source || 'Quelle'}</span>
              {relevance && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">{relevance}</span>
              )}
            </div>
            {excerpt && (
              <p className="text-foreground-muted line-clamp-2 mt-0.5">{excerpt}</p>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
});

const CompactPersonResult = memo(function CompactPersonResult({ result }: { result: unknown }) {
  const isPersonQuery = getBoolean(result, 'isPersonQuery');
  const person = getObject(result, 'person');

  if (!isPersonQuery || !person) {
    return <p className="text-xs text-foreground-muted">Keine Person gefunden</p>;
  }

  const name = getString(person, 'name');
  const fraktion = getString(person, 'fraktion');
  const wahlkreis = getString(person, 'wahlkreis');

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-blue-600" />
        <span className="font-medium">{name || 'Unbekannt'}</span>
      </div>
      <p className="text-foreground-muted mt-0.5">
        {fraktion}{wahlkreis && ` · ${wahlkreis}`}
      </p>
    </div>
  );
});

const CompactExampleResults = memo(function CompactExampleResults({ results }: { results: unknown[] }) {
  if (!results.length) return <p className="text-xs text-foreground-muted">Keine Beispiele</p>;

  return (
    <div className="space-y-1.5">
      {results.slice(0, 3).map((item, i) => {
        const platform = getString(item, 'platform');
        const content = getString(item, 'content');

        return (
          <div key={i} className="text-xs">
            {platform && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {platform}
              </span>
            )}
            {content && <p className="text-foreground-muted line-clamp-2 mt-0.5">{content}</p>}
          </div>
        );
      })}
    </div>
  );
});

const CompactWebResults = memo(function CompactWebResults({ result }: { result: unknown }) {
  const items = getArray(result, 'results') || [];

  if (!items.length) return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;

  return (
    <div className="space-y-1.5">
      {items.slice(0, 5).map((item, i) => {
        const title = getString(item, 'title');
        const url = getString(item, 'url');
        const snippet = getString(item, 'snippet');
        const domain = getString(item, 'domain');

        return (
          <div key={i} className="text-xs">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                {title || domain || url}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="font-medium">{title || 'Unbekannt'}</p>
            )}
            {snippet && <p className="text-foreground-muted line-clamp-1 mt-0.5">{snippet}</p>}
            {domain && <span className="text-[10px] text-foreground-muted">{domain}</span>}
          </div>
        );
      })}
    </div>
  );
});

interface Citation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

const ResearchResultUI = memo(function ResearchResultUI({ result }: { result: unknown }) {
  const [showAllSources, setShowAllSources] = useState(false);

  const answer = getString(result, 'answer');
  const citations = getArray(result, 'citations') as Citation[] | null;
  const followUps = getArray(result, 'followUpQuestions') as string[] | null;
  const confidence = getString(result, 'confidence');
  const searchSteps = getArray(result, 'searchSteps');

  if (!answer && (!citations || citations.length === 0)) {
    return <p className="text-xs text-foreground-muted">Keine Recherche-Ergebnisse</p>;
  }

  const renderAnswerWithCitations = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const citationId = parseInt(match[1], 10);
        const citation = citations?.find(c => c.id === citationId);
        if (citation) {
          return (
            <a
              key={idx}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800/50 mx-0.5 align-super"
              title={`${citation.title} (${citation.domain})`}
            >
              {citationId}
            </a>
          );
        }
      }
      return <Fragment key={idx}>{part}</Fragment>;
    });
  };

  const confidenceColors = {
    high: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-red-600 dark:text-red-400',
  };

  const confidenceLabels = {
    high: 'Hohe Konfidenz',
    medium: 'Mittlere Konfidenz',
    low: 'Niedrige Konfidenz',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px]">
        {confidence && (
          <span className={`flex items-center gap-1 ${confidenceColors[confidence as keyof typeof confidenceColors] || 'text-gray-500'}`}>
            <Sparkles className="h-3 w-3" />
            {confidenceLabels[confidence as keyof typeof confidenceLabels] || confidence}
          </span>
        )}
        {searchSteps && searchSteps.length > 0 && (
          <span className="text-foreground-muted">
            &middot; {searchSteps.length} Suche{searchSteps.length > 1 ? 'n' : ''}
          </span>
        )}
      </div>

      {answer && (
        <div className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {renderAnswerWithCitations(answer)}
        </div>
      )}

      {citations && citations.length > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowAllSources(!showAllSources)}
            className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showAllSources ? 'rotate-90' : ''}`} />
            Quellen ({citations.length})
          </button>

          {showAllSources && (
            <div className="mt-2 space-y-1.5">
              {citations.map((citation) => (
                <div key={citation.id} className="flex items-start gap-2 text-xs">
                  <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-foreground-muted rounded">
                    {citation.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {citation.title || citation.domain}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="font-medium">{citation.title}</span>
                    )}
                    {citation.snippet && (
                      <p className="text-foreground-muted line-clamp-1 mt-0.5">{citation.snippet}</p>
                    )}
                    {citation.domain && (
                      <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {followUps && followUps.length > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted mb-1.5">
            <MessageCircle className="h-3 w-3" />
            Weiterführende Fragen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {followUps.map((question, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-foreground-muted hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                {question}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
