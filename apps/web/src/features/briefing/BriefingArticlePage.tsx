import { Badge, LoadingSection } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { HiArrowLeft } from 'react-icons/hi';
import { Link, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import Markdown from '../../components/common/Markdown/Markdown';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';

import type { BriefingArchive } from './types';

const dateFormat: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
};

const BriefingArticlePage = () => {
  const { agentId, filename } = useParams<{ agentId: string; filename: string }>();

  const { data: archives = [], isLoading } = useQuery<BriefingArchive[]>({
    queryKey: ['briefing-archives', agentId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/briefing/archives?agentId=${encodeURIComponent(agentId || '')}`
      );
      return (res.data as { archives: BriefingArchive[] }).archives;
    },
    enabled: !!agentId,
    staleTime: 60_000,
  });

  const article = archives.find((a) => a.filename === filename);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <div className="max-w-[65ch] mx-auto px-md py-xl">
          <Link
            to={`/briefing/${encodeURIComponent(agentId || '')}/archiv`}
            className="inline-flex items-center gap-xs text-sm text-foreground-muted hover:text-foreground transition-colors no-underline mb-xl"
          >
            <HiArrowLeft />
            Zurück zum Archiv
          </Link>

          {isLoading ? (
            <LoadingSection label="Artikel wird geladen..." />
          ) : !article ? (
            <p className="text-foreground-muted text-center py-xl">Artikel nicht gefunden.</p>
          ) : (
            <article>
              <header className="mb-xl pb-lg border-b border-grey-200 dark:border-grey-700">
                <h1 className="text-3xl max-md:text-2xl font-semibold text-foreground-heading leading-tight m-0 mb-md font-[var(--font-heading)]">
                  {article.title}
                </h1>
                <div className="flex items-center gap-sm text-sm text-foreground-muted">
                  {article.date && (
                    <time dateTime={article.date}>
                      {new Date(article.date).toLocaleDateString('de-DE', dateFormat)}
                    </time>
                  )}
                  {article.articleCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {article.articleCount} Artikel
                    </Badge>
                  )}
                </div>
              </header>

              <div className="markdown-content">
                <Markdown>{article.summary}</Markdown>
              </div>
            </article>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(BriefingArticlePage, { title: 'Briefing' });
