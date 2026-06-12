import { ArticleCard, SectionHeader } from '@gruenerator/ui';

import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** Top articles of the current hot topic. */
export function TopArticlesSection() {
  const { locale } = useMonitorLocaleParam();
  const { data: snapshot } = useMonitorSnapshot(locale);

  const hotTopic = snapshot?.topics[0];
  if (!hotTopic || hotTopic.topArticles.length === 0) return null;

  return (
    <section className="mb-2xl">
      <SectionHeader title="Top-Artikel" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {hotTopic.topArticles.slice(0, 3).map((article) => (
          <ArticleCard
            key={article.url}
            url={article.url}
            title={article.title}
            excerpt={article.excerpt}
            source={article.source}
            publishedAt={article.publishedAt}
          />
        ))}
      </div>
    </section>
  );
}
