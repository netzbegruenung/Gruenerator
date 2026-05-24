import {
  Search,
  User,
  Image,
  Globe,
  Loader2,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Sparkles,
  MessageCircle,
  FileText,
} from 'lucide-react';
import { useState, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationList } from './tool-ui/citation';
import { LinkPreview } from './tool-ui/link-preview';
import { makeCitationComponents } from '../lib/citationMarkdownComponents';
import { escapeCitationMarkers } from '../lib/citationProcessing';
import {
  getString,
  getArray,
  getObject,
  getNumber,
  getBoolean,
  getToolMeta,
  getToolQuery,
  toSerializableCitation,
  parseResearchResult,
  extractDomain,
  type ToolIconKey,
} from '../lib/toolResults';

interface ToolCallUIProps {
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

// Presentation only: map the platform-neutral iconKey → lucide component, and
// keep the per-tool accent color (the shared metadata carries label + iconKey).
const ICON_BY_KEY: Record<ToolIconKey, typeof Search> = {
  search: Search,
  globe: Globe,
  book: BookOpen,
  sparkles: Sparkles,
  user: User,
  image: Image,
  'external-link': ExternalLink,
  'message-circle': MessageCircle,
  file: FileText,
};

const TOOL_COLOR: Record<string, string> = {
  search_sources: 'text-primary-500',
  gruenerator_search: 'text-primary-500',
  gruenerator_person_search: 'text-secondary-600',
  gruenerator_examples_search: 'text-secondary-600',
  web_search: 'text-secondary-700',
  research: 'text-secondary-700',
  generate_image: 'text-primary-400',
  scrape_url: 'text-secondary-700',
  recall_memory: 'text-primary-400',
  save_memory: 'text-primary-400',
};

export const ToolCallUI = memo(function ToolCallUI({
  toolName,
  args,
  state,
  result,
}: ToolCallUIProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLoading = state === 'call' || state === 'partial-call';
  const meta = getToolMeta(toolName);
  const Icon = ICON_BY_KEY[meta.iconKey];
  const config = { label: meta.label, color: TOOL_COLOR[toolName] ?? 'text-grey-600' };

  const query = useMemo(() => {
    const q = getToolQuery(args);
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
    const rc = getNumber(result, 'resultCount');
    if (rc !== null && rc > 0) return rc;
    return 0;
  }, [result, state]);

  const researchMeta = useMemo(() => {
    if (toolName !== 'research' || !result || state !== 'result') return null;
    const parsed = parseResearchResult(result);
    return {
      confidence: parsed.confidence,
      searchStepsCount: parsed.stepsList.length,
      stepsList: parsed.stepsList,
    };
  }, [toolName, result, state]);

  return (
    <div className="my-1.5 text-sm">
      <button
        onClick={() => state === 'result' && setIsExpanded(!isExpanded)}
        disabled={state !== 'result'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
          state === 'result' ? 'bg-primary/5 hover:bg-primary/10 cursor-pointer' : 'bg-primary/5'
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
        )}
        <span className="font-medium text-foreground">{config.label}</span>
        {query && (
          <span className="text-foreground-muted max-w-[120px] sm:max-w-[200px] truncate">
            &bdquo;{query}&ldquo;
          </span>
        )}
        {state === 'result' && resultCount > 0 && (
          <>
            <span className="text-foreground-muted">&middot;</span>
            {researchMeta ? (
              <>
                {researchMeta.confidence && (
                  <span
                    className={`text-[11px] font-medium ${
                      researchMeta.confidence === 'high'
                        ? 'text-status-green'
                        : researchMeta.confidence === 'medium'
                          ? 'text-status-yellow'
                          : 'text-status-red'
                    }`}
                  >
                    {researchMeta.confidence === 'high'
                      ? 'Hohe Konfidenz'
                      : researchMeta.confidence === 'medium'
                        ? 'Mittlere Konfidenz'
                        : 'Niedrige Konfidenz'}
                  </span>
                )}
                {researchMeta.searchStepsCount > 0 && (
                  <>
                    <span className="text-foreground-muted">&middot;</span>
                    <span className="text-foreground-muted text-[11px]">
                      {researchMeta.searchStepsCount} Suche
                      {researchMeta.searchStepsCount > 1 ? 'n' : ''}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-primary font-medium">{resultCount}</span>
            )}
            <ChevronRight
              className={`h-3.5 w-3.5 text-foreground-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </>
        )}
      </button>

      {isExpanded && state === 'result' && result != null && (
        <div className="mt-2 ml-2 border-l-2 border-primary/20 pl-3">
          {researchMeta && researchMeta.stepsList.length > 0 && (
            <div className="mb-2 space-y-0.5">
              {researchMeta.stepsList.map((step, i) => (
                <div key={i} className="text-foreground-muted text-xs">
                  <span aria-hidden>{step.tool === 'web_search' ? '🌐' : '📄'}</span> &bdquo;
                  {step.query}&ldquo; &middot; {step.resultsCount} Quellen
                </div>
              ))}
            </div>
          )}
          <ToolResultRenderer toolName={toolName} args={args} result={result} />
        </div>
      )}
    </div>
  );
});

const ToolResultRenderer = memo(function ToolResultRenderer({
  toolName,
  args,
  result,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}) {
  if (!result) {
    return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;
  }

  const error = getString(result, 'error');
  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  switch (toolName) {
    case 'gruenerator_search':
      return (
        <CompactSearchResults
          results={getArray(result, 'results') || (Array.isArray(result) ? result : [])}
        />
      );
    case 'gruenerator_person_search':
      return <CompactPersonResult result={result} />;
    case 'gruenerator_examples_search':
      return (
        <CompactExampleResults
          results={
            getArray(result, 'examples') ||
            getArray(result, 'results') ||
            (Array.isArray(result) ? result : [])
          }
        />
      );
    case 'search_sources':
      return (
        <CompactSearchResults
          results={getArray(result, 'results') || (Array.isArray(result) ? result : [])}
        />
      );
    case 'web_search':
      return <CompactWebResults result={result} />;
    case 'scrape_url':
      return <ScrapeUrlResult args={args} result={result} />;
    case 'research':
      return <ResearchResultUI result={result} />;
    default:
      return (
        <pre className="overflow-x-auto text-xs bg-surface p-2 rounded">
          {JSON.stringify(result, null, 2)}
        </pre>
      );
  }
});

const CompactSearchResults = memo(function CompactSearchResults({
  results,
}: {
  results: unknown[];
}) {
  if (!results.length) return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;

  const citations = results
    .slice(0, 5)
    .map((item, i) => toSerializableCitation(item, i, 'document'));

  return <CitationList id="search-results" citations={citations} variant="default" />;
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
        <User className="h-4 w-4 text-secondary-600" />
        <span className="font-medium">{name || 'Unbekannt'}</span>
      </div>
      <p className="text-foreground-muted mt-0.5">
        {fraktion}
        {wahlkreis && ` · ${wahlkreis}`}
      </p>
    </div>
  );
});

const CompactExampleResults = memo(function CompactExampleResults({
  results,
}: {
  results: unknown[];
}) {
  if (!results.length) return <p className="text-xs text-foreground-muted">Keine Beispiele</p>;

  return (
    <div className="space-y-1.5">
      {results.slice(0, 3).map((item, i) => {
        const platform = getString(item, 'platform');
        const content = getString(item, 'content');

        return (
          <div key={i} className="text-xs">
            {platform && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-badge-platform-bg text-badge-platform">
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

  const citations = items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'webpage'));

  return <CitationList id="web-results" citations={citations} variant="default" />;
});

const ScrapeUrlResult = memo(function ScrapeUrlResult({
  args,
  result,
}: {
  args: Record<string, unknown>;
  result: unknown;
}) {
  const url = getString(args, 'url') || '';
  const content = typeof result === 'string' ? result : getString(result, 'content') || '';
  const domain = extractDomain(url);
  const snippet = content.length > 200 ? content.slice(0, 200) + '…' : content;

  if (!url) return <p className="text-xs text-foreground-muted">Keine URL</p>;

  return (
    <LinkPreview
      id="scrape-url-preview"
      href={url}
      title={domain || url}
      description={snippet || undefined}
      domain={domain || undefined}
      favicon={domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined}
    />
  );
});

interface Citation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

const remarkPlugins = [remarkGfm];

const ResearchResultUI = memo(function ResearchResultUI({ result }: { result: unknown }) {
  const [showAllSources, setShowAllSources] = useState(false);

  const answer = getString(result, 'answer');
  const citations = getArray(result, 'citations') as Citation[] | null;
  const followUps = getArray(result, 'followUpQuestions') as string[] | null;
  const confidence = getString(result, 'confidence');
  const searchSteps = getArray(result, 'searchSteps');

  // Build a citation map for inline [N] chips inside the markdown render.
  // Massage the local research-Citation shape into the streaming-Citation shape
  // (adds required `source`); only id/title/url/domain are read by the renderer.
  const citationMap = useMemo(
    () =>
      new Map(
        (citations ?? []).map((c) => [
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

  if (!answer && (!citations || citations.length === 0)) {
    return <p className="text-xs text-foreground-muted">Keine Recherche-Ergebnisse</p>;
  }

  const confidenceColors = {
    high: 'text-status-green',
    medium: 'text-status-yellow',
    low: 'text-status-red',
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
          <span
            className={`flex items-center gap-1 ${confidenceColors[confidence as keyof typeof confidenceColors] || 'text-grey-500'}`}
          >
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
        <div className="text-sm leading-relaxed text-foreground">
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {escapedAnswer}
          </ReactMarkdown>
        </div>
      )}

      {citations && citations.length > 0 && (
        <div className="pt-2 border-t border-section-border">
          <button
            onClick={() => setShowAllSources(!showAllSources)}
            className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${showAllSources ? 'rotate-90' : ''}`}
            />
            Quellen ({citations.length})
          </button>

          {showAllSources && (
            <div className="mt-2">
              <CitationList
                id="research-sources"
                citations={citations.map((c) => toSerializableCitation(c, c.id, 'document'))}
                variant="default"
              />
            </div>
          )}
        </div>
      )}

      {followUps && followUps.length > 0 && (
        <div className="pt-2 border-t border-section-border">
          <div className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted mb-1.5">
            <MessageCircle className="h-3 w-3" />
            Weiterführende Fragen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {followUps.map((question, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2 py-1 rounded-full bg-surface text-foreground-muted hover:bg-surface-hover cursor-pointer transition-colors"
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
