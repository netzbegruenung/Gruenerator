import { DocumentCard, DotIndicators, useAutoAdvance } from '@gruenerator/ui';
import { ExternalLink, Library } from 'lucide-react';

import { useTopicDocuments } from '../hooks/useMonitor';

import type { MonitorArticle, MonitorLocale } from '../hooks/useMonitor';

const COLLECTION_COLORS: Record<string, string> = {
  'Grüne Bundestagsfraktion': '#22c55e',
  KommunalWiki: '#3b82f6',
  'Heinrich-Böll-Stiftung': '#f59e0b',
  'Grüne Österreich': '#22c55e',
  'Grüne Österreich (gruene.at)': '#16a34a',
};

export function HotTopicContent({
  articles,
  topicQuery,
  locale,
}: {
  articles: MonitorArticle[];
  topicQuery?: string;
  locale: MonitorLocale;
}) {
  const { data: documents = [] } = useTopicDocuments(topicQuery, locale);
  const items = articles.filter((a) => a.title).slice(0, 10);
  const news = useAutoAdvance(items.length);
  const docs = useAutoAdvance(documents.length);

  const current = items[news.idx];
  if (!current) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-md mb-md">
      {/* Left: auto-scrolling news headline */}
      <div onMouseEnter={() => news.setPaused(true)} onMouseLeave={() => news.setPaused(false)}>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block no-underline group"
        >
          <div className="flex items-center gap-xs mb-xs">
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
              {current.source}
            </span>
            {current.publishedAt && (
              <span className="text-[10px] text-grey-400">
                ·{' '}
                {new Date(current.publishedAt).toLocaleString('de-DE', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <ExternalLink className="h-3 w-3 text-grey-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
          </div>
          <p className="text-base font-semibold text-foreground-heading leading-snug m-0 mb-xs group-hover:text-primary-600 transition-colors">
            {current.title}
          </p>
          {current.excerpt && (
            <p className="text-sm text-foreground/70 leading-relaxed m-0 line-clamp-2">
              {current.excerpt.slice(0, 200)}
            </p>
          )}
        </a>
        <DotIndicators count={items.length} activeIdx={news.idx} onSelect={news.setIdx} />
      </div>

      {/* Right: document carousel */}
      <div onMouseEnter={() => docs.setPaused(true)} onMouseLeave={() => docs.setPaused(false)}>
        {documents.length > 0 ? (
          <>
            <DocumentCard
              title={documents[docs.idx].document_title}
              excerpt={documents[docs.idx].relevant_content?.slice(0, 200)}
              sourceUrl={documents[docs.idx].source_url}
              sourceName={documents[docs.idx].collection_name}
              sourceColor={COLLECTION_COLORS[documents[docs.idx].collection_name]}
            />
            <DotIndicators count={documents.length} activeIdx={docs.idx} onSelect={docs.setIdx} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-md rounded-lg border border-dashed border-grey-200 dark:border-grey-700 h-full">
            <Library className="h-5 w-5 text-grey-300 mb-xs" />
            <p className="text-[11px] text-grey-400 text-center">
              Suche nach passenden Dokumenten…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
