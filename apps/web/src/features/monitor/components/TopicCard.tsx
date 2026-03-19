import { Badge } from '@gruenerator/ui';
import { ExternalLink } from 'lucide-react';

import { TOPIC_CONFIG } from '../topicConfig';

import type { TopicScore } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

import { cn } from '@/utils/cn';

interface TopicCardProps {
  topicScore: TopicScore;
  maxScore: number;
  onClick: (topic: TopicCategory) => void;
}

export function TopicCard({ topicScore, maxScore, onClick }: TopicCardProps) {
  const config = TOPIC_CONFIG[topicScore.topic];
  if (!config) return null;

  const Icon = config.icon;
  const barWidth = maxScore > 0 ? (topicScore.score / maxScore) * 100 : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(topicScore.topic)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(topicScore.topic);
        }
      }}
      className={cn(
        'flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md p-md h-full',
        'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600'
      )}
    >
      <div className="flex items-center justify-between mb-sm">
        <div className="flex items-center gap-sm">
          <Icon className={cn('h-5 w-5', config.color)} />
          <span className="text-sm font-semibold text-foreground-heading">{config.name}</span>
        </div>
        <Badge variant="secondary">{topicScore.articleCount}</Badge>
      </div>

      <div className="mb-sm">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
          <div
            className={cn('h-full rounded-full transition-all', config.barColor)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-grey-500 dark:text-grey-400 mb-sm m-0">{config.description}</p>

      {topicScore.topArticles.length > 0 && (
        <ul className="flex-1 space-y-1.5 m-0 p-0 list-none">
          {topicScore.topArticles.slice(0, 3).map((article) => (
            <li key={article.url}>
              <div className="flex items-start gap-1">
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-grey-400" />
                <div className="min-w-0">
                  <span className="line-clamp-1 text-xs font-medium text-foreground">
                    {article.title}
                  </span>
                  {article.excerpt && (
                    <span className="line-clamp-1 text-xs text-grey-500 dark:text-grey-400">
                      {article.excerpt.slice(0, 120)}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
