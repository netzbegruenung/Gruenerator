import { type MonitorLocale } from '@gruenerator/contracts';

import { useWissenNews } from '../../hooks/monitor/useWissenNews';

import { HeadlineSlider } from './HeadlineSlider';

/**
 * The headline slider with its own data. Subscribed in the screen, every update of
 * either news query (pending, fetching, success) re-rendered the whole Wissen page
 * and the slider with it — seven times while it loaded. Here only the slider does.
 */
export function WissenHeadlines({
  locale,
  onOpenBriefing,
}: {
  locale: MonitorLocale;
  onOpenBriefing: () => void;
}) {
  const news = useWissenNews(locale);
  return (
    <HeadlineSlider
      items={news.headlines}
      loading={news.headlinesPending}
      error={news.error}
      onRetry={news.refetch}
      onOpenBriefing={onOpenBriefing}
    />
  );
}
