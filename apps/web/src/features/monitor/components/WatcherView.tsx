import {
  ArticleCard,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  LoadingSection,
  Skeleton,
} from '@gruenerator/ui';
import { AlertTriangle, Search, Shield, Sparkles, TrendingUp } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import {
  useWatcherEntities,
  useEntityResults,
  useEntitySummary,
  useMonitorSearch,
} from '../hooks/useMonitor';

import type { MonitorLocale, MonitorArticle } from '../hooks/useMonitor';

interface WatcherViewProps {
  locale: MonitorLocale;
}

function useHighlightPattern(keywords: string[]): RegExp | null {
  return useMemo(() => {
    if (keywords.length === 0) return null;
    return new RegExp(
      `(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
      'gi'
    );
  }, [keywords]);
}

function highlightMatch(text: string, pattern: RegExp | null): React.ReactNode {
  if (!pattern) return text;
  pattern.lastIndex = 0;
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    pattern.lastIndex = 0;
    return pattern.test(part) ? (
      <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 dark:bg-yellow-800">
        {part}
      </mark>
    ) : (
      part
    );
  });
}

function useAvgSentiment(articles?: MonitorArticle[]): number | null {
  return useMemo(() => {
    const withSentiment = (articles ?? []).filter((a) => a.erSentiment != null);
    if (withSentiment.length === 0) return null;
    return withSentiment.reduce((sum, a) => sum + a.erSentiment!, 0) / withSentiment.length;
  }, [articles]);
}

interface RiskItem {
  title: string;
  source: string;
  reasoning: string;
  severity: 'high' | 'medium' | 'low';
}

function RiskBadge({ sentiment }: { sentiment: number | null }) {
  if (sentiment == null) return null;
  const level = sentiment < -0.2 ? 'Hoch' : sentiment > 0.1 ? 'Niedrig' : 'Mittel';
  const color =
    sentiment < -0.2
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : sentiment > 0.1
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{level}</span>;
}

const SEVERITY_COLORS = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-grey-400',
};

function RiskItemCard({ item, type }: { item: RiskItem; type: 'risk' | 'opportunity' }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = type === 'risk' ? SEVERITY_COLORS[item.severity] : 'border-l-green-500';

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left border-l-3 pl-sm py-xs rounded-r-md transition-colors hover:bg-grey-50 dark:hover:bg-grey-800/30 ${borderColor}`}
    >
      <div className="flex items-start justify-between gap-xs">
        <span className="text-xs font-medium text-foreground leading-snug">{item.title}</span>
        <span className="text-[10px] text-grey-400 shrink-0">{item.source}</span>
      </div>
      {expanded && (
        <p className="text-[11px] text-foreground/70 mt-xs leading-relaxed">{item.reasoning}</p>
      )}
    </button>
  );
}

function EntityView({ entityId, locale }: { entityId: string; locale: MonitorLocale }) {
  const { data: entities } = useWatcherEntities();
  const { data: results, isLoading } = useEntityResults(entityId, locale);
  const { data: summaryData, isLoading: summaryLoading } = useEntitySummary(entityId, locale);
  const avgSentiment = useAvgSentiment(results?.articles);

  const entity = entities?.find((e) => e.id === entityId);
  const keywords = entity?.keywords ?? [];
  const pattern = useHighlightPattern(keywords);

  const riskBorderColor =
    avgSentiment != null && avgSentiment < -0.2
      ? 'border-red-300 dark:border-red-800'
      : avgSentiment != null && avgSentiment > 0.1
        ? 'border-green-300 dark:border-green-800'
        : 'border-amber-200 dark:border-amber-800';

  return (
    <div>
      {(summaryLoading || summaryData) && (
        <Card className="mb-lg">
          <CardHeader>
            <div className="flex items-center gap-sm">
              <Sparkles className="h-4 w-4 text-primary-500" />
              <CardTitle>Grünerator-Zusammenfassung</CardTitle>
            </div>
            <CardDescription>
              Was sagen die Medien über {entity?.label ?? entityId}?
              {summaryData?.generatedAt && (
                <span className="ml-sm text-xs text-grey-400">
                  Erstellt:{' '}
                  {new Date(summaryData.generatedAt).toLocaleString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
            ) : (
              <Markdown className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                {summaryData?.summary ?? ''}
              </Markdown>
            )}
          </CardContent>
        </Card>
      )}

      {(summaryData?.riskAnalysis || summaryData?.attackAnalysis) && (
        <Card className={`mb-lg ${riskBorderColor}`}>
          <CardHeader>
            <div className="flex items-center gap-sm">
              <Shield className="h-4 w-4 text-amber-500" />
              <CardTitle>Risiko-Monitor</CardTitle>
              <RiskBadge sentiment={avgSentiment} />
            </div>
          </CardHeader>
          <CardContent>
            {summaryData.riskAnalysis ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <div>
                  <div className="flex items-center gap-xs mb-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-foreground-heading">Risiken</span>
                  </div>
                  <div className="space-y-xs">
                    {summaryData.riskAnalysis.risks.map((risk, i) => (
                      <RiskItemCard key={i} item={risk} type="risk" />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-xs mb-sm">
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-foreground-heading">Chancen</span>
                  </div>
                  <div className="space-y-xs">
                    {summaryData.riskAnalysis.opportunities.map((opp, i) => (
                      <RiskItemCard key={i} item={opp} type="opportunity" />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Markdown className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                {summaryData.attackAnalysis}
              </Markdown>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingSection />}

      {results && (
        <>
          <p className="mb-md text-xs text-grey-500 dark:text-grey-400">
            {results.count} Treffer in {results.sources.length} Quellen
          </p>

          {results.articles.length === 0 && (
            <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
              Keine Artikel über {entity?.label ?? entityId} in den letzten 24 Stunden.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
            {results.articles.map((article) => (
              <ArticleCard
                key={article.url}
                url={article.url}
                title={highlightMatch(article.title, pattern)}
                excerpt={
                  article.excerpt
                    ? highlightMatch(article.excerpt.slice(0, 250), pattern)
                    : undefined
                }
                source={article.source}
                publishedAt={article.publishedAt}
                sentiment={article.erSentiment}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CustomSearch({ locale }: { locale: MonitorLocale }) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchKeywords = useMemo(() => (debouncedQuery ? [debouncedQuery] : []), [debouncedQuery]);
  const pattern = useHighlightPattern(searchKeywords);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value.trim()), 400);
  }, []);

  const { data, isLoading } = useMonitorSearch(debouncedQuery, locale);

  return (
    <div>
      <div className="relative mb-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-400" />
        <Input
          value={inputValue}
          onChange={handleChange}
          placeholder="Name oder Begriff eingeben..."
          className="pl-10"
        />
      </div>

      {isLoading && <LoadingSection />}

      {data && (
        <>
          <p className="mb-md text-xs text-grey-500 dark:text-grey-400">
            {data.count} Treffer für &ldquo;{data.query}&rdquo; in {data.sources.length} Quellen
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
            {data.articles.map((article) => (
              <ArticleCard
                key={article.url}
                url={article.url}
                title={highlightMatch(article.title, pattern)}
                excerpt={
                  article.excerpt
                    ? highlightMatch(article.excerpt.slice(0, 250), pattern)
                    : undefined
                }
                source={article.source}
                publishedAt={article.publishedAt}
                sentiment={article.erSentiment}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function WatcherView({ locale }: WatcherViewProps) {
  const entityId = locale === 'at' ? 'gruene-at' : 'gruene';

  return (
    <div>
      <EntityView entityId={entityId} locale={locale} />

      <div className="mt-xl border-t border-grey-200 pt-lg dark:border-grey-700">
        <p className="mb-md text-sm font-medium text-foreground-heading">Eigene Suche</p>
        <CustomSearch locale={locale} />
      </div>
    </div>
  );
}
