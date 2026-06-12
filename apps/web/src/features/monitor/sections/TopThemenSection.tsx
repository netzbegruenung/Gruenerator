import { Card, CardContent, ProgressBar, SectionHeader } from '@gruenerator/ui';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

/** Compact ranking of the top five topics, linking into /monitor/themen. */
export function TopThemenSection() {
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data: snapshot } = useMonitorSnapshot(locale);

  if (!snapshot) return null;

  const maxScore = Math.max(...snapshot.topics.map((t) => t.score), 1);

  return (
    <section className="mb-2xl">
      <SectionHeader
        title="Top-Themen"
        onTitleClick={() => navigate(withLocale('/monitor/themen'))}
        actions={
          <Link
            to={withLocale('/monitor/themen')}
            className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
          >
            Alle Themen
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <Card className="flex flex-col">
        <CardContent className="pt-md pb-md flex-1 flex flex-col">
          <div className="flex flex-col justify-between flex-1">
            {snapshot.topics
              .slice(0, 5)
              .filter((t) => t.articleCount > 0)
              .map((t) => {
                const config = TOPIC_CONFIG[t.topic];
                if (!config) return null;
                const Icon = config.icon;
                const barValue = maxScore > 0 ? (t.score / maxScore) * 100 : 0;

                return (
                  <Link
                    key={t.topic}
                    to={withLocale(`/monitor/themen/${t.topic}`)}
                    className="w-full flex items-center gap-sm px-sm py-1 rounded-md hover:bg-grey-50 dark:hover:bg-grey-800/50 transition-colors group text-left no-underline"
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
                    <span className="text-xs font-medium text-foreground w-24 shrink-0">
                      {config.name}
                    </span>
                    <div className="flex-1">
                      <ProgressBar value={barValue} color={TOPIC_COLORS[t.topic]} />
                    </div>
                    <span className="text-[11px] text-grey-400 tabular-nums shrink-0">
                      {t.articleCount}
                    </span>
                    <ChevronRight className="h-3 w-3 text-grey-300 group-hover:text-grey-500 transition-colors shrink-0" />
                  </Link>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
