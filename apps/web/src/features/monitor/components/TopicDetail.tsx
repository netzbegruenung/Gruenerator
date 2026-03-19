import {
  ArticleCard,
  CardGrid,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Input,
  LoadingSection,
  SectionHeader,
} from '@gruenerator/ui';
import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useTopicArticles } from '../hooks/useMonitor';
import { TOPIC_CONFIG } from '../topicConfig';

import type { MonitorLocale } from '../hooks/useMonitor';
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
                <ArticleCard
                  key={article.url}
                  url={article.url}
                  title={highlightMatch(article.title, query)}
                  excerpt={
                    article.excerpt
                      ? highlightMatch(article.excerpt.slice(0, 250), query)
                      : undefined
                  }
                  source={article.source}
                  publishedAt={article.publishedAt}
                  sentiment={article.erSentiment}
                />
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
