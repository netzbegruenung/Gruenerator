import {
  Search,
  User,
  Image,
  Globe,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Sparkles,
  MessageCircle,
  Cloud,
  FileText,
  Presentation,
  Table,
  SquareKanban,
  ChartColumn,
} from 'lucide-react';
import { Fragment, useState, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { makeCitationComponents } from '../lib/citationMarkdownComponents';
import { escapeCitationMarkers } from '../lib/citationProcessing';
import { resolveToolEntry } from '../lib/toolRegistry';
import {
  getToolMeta,
  getToolQuery,
  getToolResultCount,
  toolResultSummary,
  toolOutcome,
  toolErrorMessage,
  researchCitationToSerializable,
  parseResearchResult,
  CONFIDENCE_LABELS,
  type ToolAccent,
  type ToolIconKey,
} from '../lib/toolResults';

import { ToolCall } from './assistant-ui/elements/tool-call';
import { ToolError } from './assistant-ui/elements/tool-error';
import { PressemitteilungExamplesCard } from './PressemitteilungExamplesCard';
import { CitationList } from './tool-ui/citation';
import { LinkPreview } from './tool-ui/link-preview';

import type {
  ExampleSnippet,
  ImageResultVM,
  KeyValueVM,
  MarkdownReportVM,
  PersonVM,
} from '../lib/toolViewModels';

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
  cloud: Cloud,
  file: FileText,
  presentation: Presentation,
  table: Table,
  board: SquareKanban,
  chart: ChartColumn,
};

// Presentation of the shared semantic accent. The old TOOL_COLOR table keyed
// seven colours off raw tool NAMES and lived only on web, so every new tool was
// grey and native had no accent at all. `meta.accent` is shared metadata.
const ACCENT_CLASS: Record<ToolAccent, string> = {
  retrieval: 'text-primary-500',
  knowledge: 'text-secondary-600',
  create: 'text-primary-400',
  personal: 'text-secondary-700',
  external: 'text-secondary-700',
  neutral: 'text-grey-600',
};

export const ToolCallUI = memo(function ToolCallUI({
  toolName,
  args,
  state,
  result,
}: ToolCallUIProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const done = state === 'result';
  const meta = getToolMeta(toolName);
  // One source for "did this fail" — checked on BOTH channels, so the live
  // stream and a reloaded thread agree (see toolOutcome).
  const outcome = toolOutcome(result, done ? 'result' : 'call');
  const Icon = ICON_BY_KEY[meta.iconKey];

  // `toolName` now participates: tools whose subject is not called `query`
  // (rezept_laden's `rezept`, the create_* family's `prompt`) showed none before.
  const query = useMemo(() => getToolQuery(args, toolName), [args, toolName]);

  const resultCount = useMemo(() => (done ? getToolResultCount(result) : 0), [result, done]);

  // One line for what came of it. Shared with native, so both platforms say the
  // same thing about the same result.
  const summary = useMemo(
    () => (done ? toolResultSummary(toolName, args, result) : null),
    [done, toolName, args, result]
  );

  const researchMeta = useMemo(() => {
    if (toolName !== 'research' || !result || !done) return null;
    const parsed = parseResearchResult(result);
    return {
      confidence: parsed.confidence,
      searchStepsCount: parsed.stepsList.length,
      stepsList: parsed.stepsList,
    };
  }, [toolName, result, done]);

  const status = done ? (
    <>
      {researchMeta?.confidence && (
        <span
          className={`text-[11px] font-medium ${CONFIDENCE_COLORS[researchMeta.confidence] ?? 'text-grey-500'}`}
        >
          {CONFIDENCE_LABELS[researchMeta.confidence] ?? researchMeta.confidence}
        </span>
      )}
      {summary ? (
        <span
          className={`max-w-[12rem] truncate text-[11px] sm:max-w-[20rem] ${
            outcome === 'error' ? 'text-destructive' : 'text-foreground-muted'
          }`}
        >
          {summary}
        </span>
      ) : (
        resultCount > 0 && (
          <span className="text-primary text-[11px] font-medium">{resultCount}</span>
        )
      )}
    </>
  ) : null;

  return (
    <div className="my-1.5 text-sm">
      <ToolCall
        icon={<Icon className={`h-3.5 w-3.5 ${ACCENT_CLASS[meta.accent ?? 'neutral']}`} />}
        label={meta.label}
        // Falls back to the resting label for tools that declare no verb pair,
        // which is exactly the pre-change behaviour.
        activeLabel={meta.activeLabel ?? meta.label}
        query={query}
        outcome={outcome}
        status={status}
        open={isExpanded && done}
        // A running card must not open — but unlike the old `disabled` button it
        // stays in the tab order (the fix McpToolUI already made).
        onOpenChange={(next) => {
          if (done) setIsExpanded(next);
        }}
      >
        {done && result != null && (
          <>
            {researchMeta && researchMeta.stepsList.length > 0 && (
              <div className="mb-2 space-y-0.5">
                {researchMeta.stepsList.map((step, i) => (
                  <div key={i} className="text-foreground-muted text-xs">
                    &bdquo;{step.query}&ldquo; &middot; {step.resultsCount} Quellen
                  </div>
                ))}
              </div>
            )}
            <ToolResultRenderer toolName={toolName} args={args} result={result} />
          </>
        )}
      </ToolCall>
    </div>
  );
});

// Dispatches a finished tool result via the shared registry: parse to a
// platform-neutral view-model, then map its kind to the web component.
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

  const error = toolErrorMessage(result);
  if (error) {
    return (
      <ToolError
        name={getToolMeta(toolName).label}
        target={getToolQuery(args, toolName)}
        message={error}
      />
    );
  }

  const vm = resolveToolEntry(toolName).parse(args, result);

  switch (vm.kind) {
    case 'citations':
      if (!vm.citations.length)
        return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;
      return <CitationList id={`${toolName}-results`} citations={vm.citations} variant="default" />;
    case 'person':
      return <CompactPersonResult vm={vm} />;
    case 'snippets':
      return <CompactExampleResults items={vm.items} />;
    case 'link-preview':
      return (
        <LinkPreview
          id="scrape-url-preview"
          href={vm.href}
          title={vm.title}
          description={vm.description ?? undefined}
          domain={vm.domain ?? undefined}
          favicon={vm.favicon ?? undefined}
        />
      );
    case 'markdown-report':
      return <ResearchResultUI vm={vm} />;
    case 'press-examples':
      // The expandable card parses the raw result itself (it also handles the
      // empty/message state), so pass it through untouched.
      return <PressemitteilungExamplesCard query={getToolQuery(args) ?? ''} result={result} />;
    case 'image':
      return <ImageResult vm={vm} />;
    case 'text-note':
      if (!vm.text) return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;
      return <p className="text-xs text-foreground-muted whitespace-pre-wrap">{vm.text}</p>;
    case 'interactive':
      // ask_human renders through its own toolkit component, never here.
      return null;
    case 'key-value':
      return <KeyValueResult vm={vm} />;
  }
});

const CompactPersonResult = memo(function CompactPersonResult({ vm }: { vm: PersonVM }) {
  if (!vm.found) {
    return <p className="text-xs text-foreground-muted">Keine Person gefunden</p>;
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-secondary-600" />
        <span className="font-medium">{vm.name || 'Unbekannt'}</span>
      </div>
      <p className="text-foreground-muted mt-0.5">
        {vm.fraktion}
        {vm.wahlkreis && ` · ${vm.wahlkreis}`}
      </p>
    </div>
  );
});

const CompactExampleResults = memo(function CompactExampleResults({
  items,
}: {
  items: ExampleSnippet[];
}) {
  if (!items.length) return <p className="text-xs text-foreground-muted">Keine Beispiele</p>;

  return (
    <div className="space-y-1.5">
      {items.slice(0, 3).map((item, i) => (
        <div key={i} className="text-xs">
          {item.platform && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-badge-platform-bg text-badge-platform">
              {item.platform}
            </span>
          )}
          {item.content && (
            <p className="text-foreground-muted line-clamp-2 mt-0.5">{item.content}</p>
          )}
        </div>
      ))}
    </div>
  );
});

const ImageResult = memo(function ImageResult({ vm }: { vm: ImageResultVM }) {
  return (
    <figure className="space-y-1">
      <img src={vm.url} alt={vm.alt ?? ''} loading="lazy" className="max-h-64 rounded-lg" />
      {vm.prompt && (
        <figcaption className="text-[10px] text-foreground-muted">{vm.prompt}</figcaption>
      )}
    </figure>
  );
});

// Generic fallback for unregistered/future tools — replaces the old raw JSON dump.
const KeyValueResult = memo(function KeyValueResult({ vm }: { vm: KeyValueVM }) {
  if (!vm.entries.length && !vm.citations.length && !vm.markdown && !vm.imageUrl) {
    return <p className="text-xs text-foreground-muted">Keine Ergebnisse</p>;
  }

  return (
    <div className="space-y-2 text-xs">
      {vm.imageUrl && (
        <img src={vm.imageUrl} alt="" loading="lazy" className="max-h-64 rounded-lg" />
      )}
      {vm.markdown && (
        <div className="text-foreground leading-relaxed">
          <ReactMarkdown remarkPlugins={remarkPlugins}>{vm.markdown}</ReactMarkdown>
        </div>
      )}
      {vm.entries.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {vm.entries.map((entry) => (
            <Fragment key={entry.label}>
              <dt className="text-foreground-muted">{entry.label}</dt>
              <dd className="text-foreground break-words">{entry.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {vm.citations.length > 0 && (
        <CitationList id="fallback-citations" citations={vm.citations} variant="default" />
      )}
    </div>
  );
});

const remarkPlugins = [remarkGfm];

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-status-green',
  medium: 'text-status-yellow',
  low: 'text-status-red',
};

const ResearchResultUI = memo(function ResearchResultUI({ vm }: { vm: MarkdownReportVM }) {
  const [showAllSources, setShowAllSources] = useState(false);

  // Build a citation map for inline [N] chips inside the markdown render.
  // Massage the research-Citation shape into the streaming-Citation shape
  // (adds required `source`); only id/title/url/domain are read by the renderer.
  const citationMap = useMemo(
    () => new Map(vm.citations.map((c) => [c.id, { ...c, source: 'research' }])),
    [vm.citations]
  );
  const markdownComponents = useMemo(() => makeCitationComponents(citationMap), [citationMap]);
  const escapedAnswer = useMemo(
    () => (vm.answer ? escapeCitationMarkers(vm.answer) : ''),
    [vm.answer]
  );

  if (!vm.answer && vm.citations.length === 0) {
    return <p className="text-xs text-foreground-muted">Keine Recherche-Ergebnisse</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px]">
        {vm.confidence && (
          <span
            className={`flex items-center gap-1 ${CONFIDENCE_COLORS[vm.confidence] || 'text-grey-500'}`}
          >
            <Sparkles className="h-3 w-3" />
            {CONFIDENCE_LABELS[vm.confidence] || vm.confidence}
          </span>
        )}
        {vm.stepsList.length > 0 && (
          <span className="text-foreground-muted">
            &middot; {vm.stepsList.length} Suche{vm.stepsList.length > 1 ? 'n' : ''}
          </span>
        )}
      </div>

      {vm.answer && (
        <div className="text-sm leading-relaxed text-foreground">
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {escapedAnswer}
          </ReactMarkdown>
        </div>
      )}

      {vm.citations.length > 0 && (
        <div className="pt-2 border-t border-section-border">
          <button
            onClick={() => setShowAllSources(!showAllSources)}
            className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${showAllSources ? 'rotate-90' : ''}`}
            />
            Quellen ({vm.citations.length})
          </button>

          {showAllSources && (
            <div className="mt-2">
              <CitationList
                id="research-sources"
                citations={vm.citations.map(researchCitationToSerializable)}
                variant="default"
              />
            </div>
          )}
        </div>
      )}

      {vm.followUpQuestions.length > 0 && (
        <div className="pt-2 border-t border-section-border">
          <div className="flex items-center gap-1 text-[10px] font-medium text-foreground-muted mb-1.5">
            <MessageCircle className="h-3 w-3" />
            Weiterführende Fragen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vm.followUpQuestions.map((question, idx) => (
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
