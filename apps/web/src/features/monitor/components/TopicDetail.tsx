import {
  Badge,
  CardGrid,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Input,
  LoadingSection,
  SectionHeader,
} from '@gruenerator/ui';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useTopicArticles } from '../hooks/useMonitor';
import { TOPIC_CONFIG } from '../topicConfig';

import type { MonitorLocale, MonitorArticle } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

import { cn } from '@/utils/cn';

interface TopicDetailProps {
  topic: TopicCategory;
  locale: MonitorLocale;
  onBack: () => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-200 px-0.5 dark:bg-yellow-800">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ArticleCard({ article, query }: { article: MonitorArticle; query: string }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md p-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md no-underline"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-heading m-0">
          {highlightMatch(article.title, query)}
        </p>
        {article.excerpt && (
          <p className="mt-xs text-sm text-foreground leading-relaxed m-0 line-clamp-2">
            {highlightMatch(article.excerpt.slice(0, 250), query)}
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

export function TopicDetail({ topic, locale, onBack }: TopicDetailProps) {
  const { data, isLoading } = useTopicArticles(topic, locale);
  const [query, setQuery] = useState('');
  const config = TOPIC_CONFIG[topic];

  const filteredArticles = useMemo(() => {
    if (!data?.articles) return [];
    if (query.length < 2) return data.articles;
    const lower = query.toLowerCase();
    return data.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(lower) ||
        a.excerpt.toLowerCase().includes(lower) ||
        a.source.toLowerCase().includes(lower)
    );
  }, [data?.articles, query]);

  if (!config) return null;
  const Icon = config.icon;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-md flex items-center gap-sm border-none bg-transparent text-sm text-grey-500 hover:text-foreground cursor-pointer transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Übersicht
      </button>

      <SectionHeader
        title={config.name}
        actions={
          <div className="flex items-center gap-sm">
            <Icon className={cn('h-5 w-5', config.color)} />
            <span className="text-sm text-grey-500 dark:text-grey-400">{config.description}</span>
          </div>
        }
      />

      <div className="relative mb-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Artikel zu ${config.name} durchsuchen...`}
          className="pl-10"
        />
      </div>

      {isLoading && <LoadingSection />}

      {data && (
        <>
          <p className="mb-md text-xs text-grey-500 dark:text-grey-400">
            {query.length >= 2
              ? `${filteredArticles.length} von ${data.articles.length} Artikeln`
              : `${data.articles.length} Artikel`}
          </p>

          {filteredArticles.length > 0 ? (
            <CardGrid columns="1">
              {filteredArticles.map((article) => (
                <ArticleCard key={article.url} article={article} query={query} />
              ))}
            </CardGrid>
          ) : query.length >= 2 ? (
            <Empty>
              <EmptyMedia>
                <Search className="h-10 w-10 text-grey-300 dark:text-grey-600" />
              </EmptyMedia>
              <EmptyTitle>Keine Treffer</EmptyTitle>
              <EmptyDescription>
                Keine Artikel zu &ldquo;{query}&rdquo; im Thema {config.name} gefunden.
              </EmptyDescription>
            </Empty>
          ) : (
            <Empty>
              <EmptyMedia>
                <Search className="h-10 w-10 text-grey-300 dark:text-grey-600" />
              </EmptyMedia>
              <EmptyTitle>Keine Artikel</EmptyTitle>
              <EmptyDescription>
                Keine Artikel für {config.name} in den letzten 24 Stunden.
              </EmptyDescription>
            </Empty>
          )}
        </>
      )}
    </div>
  );
}
