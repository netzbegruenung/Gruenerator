import { ArticleCard, cn, LoadingSection, StatusBanner } from '@gruenerator/ui';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import { MONITOR_MUTED } from '../components/theme';
import { useEntityResults } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/**
 * /watcher — Berichterstattung über die Grünen der letzten 24 Stunden: nur die
 * Artikel aus RSS und Event Registry, die die Watcher-Stichwörter treffen.
 */
function MonitorWatcherPage() {
  const { locale } = useMonitorLocaleParam();
  const { data, isLoading, error } = useEntityResults(
    locale === 'at' ? 'gruene-at' : 'gruene',
    locale
  );

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="watcher"
        title="Watcher"
        right={
          <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
            Berichterstattung über die Grünen der letzten 24 Stunden
            {data ? ` · ${data.count} Artikel aus ${data.sources.length} Quellen` : ''}
          </p>
        }
      />

      {isLoading && <LoadingSection />}

      {error && (
        <StatusBanner variant="error" className="mb-lg">
          Artikel konnten nicht geladen werden. Bitte versuche es später erneut.
        </StatusBanner>
      )}

      {data?.articles.length === 0 && (
        <p className={cn('py-lg text-center text-sm', MONITOR_MUTED)}>
          Keine Artikel über die Grünen in den letzten 24 Stunden.
        </p>
      )}

      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {data?.articles.map((article) => (
          <ArticleCard
            key={article.url}
            url={article.url}
            title={article.title}
            excerpt={article.excerpt ? article.excerpt.slice(0, 250) : undefined}
            source={article.source}
            publishedAt={article.publishedAt}
          />
        ))}
      </div>
    </PageContainer>
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorWatcherPage as MonitorWatcherContent };

export default withAuthRequired(MonitorWatcherPage, { title: 'Watcher' });
