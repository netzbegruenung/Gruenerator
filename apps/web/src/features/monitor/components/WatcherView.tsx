import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardGrid,
  Input,
  LoadingSection,
  Skeleton,
} from '@gruenerator/ui';
import { ExternalLink, Search, Shield, Sparkles } from 'lucide-react';
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

function ArticleCard({ article, pattern }: { article: MonitorArticle; pattern: RegExp | null }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md p-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md no-underline"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-heading m-0">
          {highlightMatch(article.title, pattern)}
        </p>
        {article.excerpt && (
          <p className="mt-xs text-sm text-foreground leading-relaxed m-0 line-clamp-2">
            {highlightMatch(article.excerpt.slice(0, 250), pattern)}
          </p>
        )}
        <div className="mt-sm flex items-center gap-sm">
          <Badge variant="secondary" className="bg-secondary-600 text-white border-transparent">
            {article.source}
          </Badge>
          {article.publishedAt && (
            <span className="text-xs text-grey-500 dark:text-grey-400">
              {new Date(article.publishedAt).toLocaleDateString('de-DE', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>
      <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-grey-400" />
    </a>
  );
}

function EntityView({ entityId, locale }: { entityId: string; locale: MonitorLocale }) {
  const { data: entities } = useWatcherEntities();
  const { data: results, isLoading } = useEntityResults(entityId, locale);
  const { data: summaryData, isLoading: summaryLoading } = useEntitySummary(entityId, locale);

  const entity = entities?.find((e) => e.id === entityId);
  const keywords = entity?.keywords ?? [];
  const pattern = useHighlightPattern(keywords);

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

      {summaryData?.attackAnalysis && (
        <Card className="mb-lg border-amber-200 dark:border-amber-800">
          <CardHeader>
            <div className="flex items-center gap-sm">
              <Shield className="h-4 w-4 text-amber-500" />
              <CardTitle>Strategische Analyse</CardTitle>
            </div>
            <CardDescription>
              Vergleich der aktuellen Berichterstattung mit unseren Positionen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Markdown className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
              {summaryData.attackAnalysis}
            </Markdown>
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

          <CardGrid columns="1">
            {results.articles.map((article) => (
              <ArticleCard key={article.url} article={article} pattern={pattern} />
            ))}
          </CardGrid>
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
          <CardGrid columns="1">
            {data.articles.map((article) => (
              <ArticleCard key={article.url} article={article} pattern={pattern} />
            ))}
          </CardGrid>
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
