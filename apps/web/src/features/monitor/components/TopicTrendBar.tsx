import { TOPIC_CONFIG } from '../topicConfig';

import type { TopicScore } from '../hooks/useMonitor';

import { cn } from '@/utils/cn';

interface TopicTrendBarProps {
  topics: TopicScore[];
}

export function TopicTrendBar({ topics }: TopicTrendBarProps) {
  const totalScore = topics.reduce((sum, t) => sum + t.score, 0);
  if (totalScore === 0) return null;

  const activeTopics = topics.filter((t) => t.score > 0);

  return (
    <section className="mb-xl">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
        {activeTopics.map((t) => {
          const config = TOPIC_CONFIG[t.topic];
          if (!config) return null;
          const widthPercent = (t.score / totalScore) * 100;
          if (widthPercent < 1) return null;

          return (
            <div
              key={t.topic}
              className={cn('h-full transition-all', config.barColor)}
              style={{ width: `${widthPercent}%` }}
              title={`${config.name}: ${t.articleCount} Artikel`}
            />
          );
        })}
      </div>
      <div className="mt-sm flex flex-wrap gap-sm">
        {activeTopics.slice(0, 7).map((t) => {
          const config = TOPIC_CONFIG[t.topic];
          if (!config) return null;
          return (
            <span
              key={t.topic}
              className="flex items-center gap-1 text-xs text-grey-500 dark:text-grey-400"
            >
              <span className={cn('inline-block h-2 w-2 rounded-full', config.dotColor)} />
              {config.name}
            </span>
          );
        })}
      </div>
    </section>
  );
}
