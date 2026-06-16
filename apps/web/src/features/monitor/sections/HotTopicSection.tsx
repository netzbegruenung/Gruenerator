import { Skeleton } from '@gruenerator/ui';
import { Flame, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import {
  MONITOR_CITATION_LINK_CONFIG,
  mapMonitorCitations,
  useMonitorBriefing,
  useMonitorSnapshot,
} from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

/** Hot-topic hero with the AI briefing — the lead story of the monitor feed. */
export function HotTopicSection() {
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: briefing, isLoading: briefingLoading } = useMonitorBriefing(locale);
  const briefingCitations = useMemo(
    () => mapMonitorCitations(briefing?.citations),
    [briefing?.citations]
  );

  const hotTopic = snapshot?.topics[0];
  const hotTopicConfig = hotTopic ? TOPIC_CONFIG[hotTopic.topic] : null;
  const topHeadline = hotTopic?.topArticles[0]?.title;

  if (!hotTopic || !hotTopicConfig) return null;

  return (
    <section className="mb-2xl">
      <div className="rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background">
        <div className="mb-md">
          {topHeadline && (
            <h2 className="flex items-center gap-sm text-xl sm:text-2xl font-black text-foreground-heading m-0 mb-xs">
              <Flame className="h-6 w-6 text-orange-500 shrink-0" />
              {topHeadline}
            </h2>
          )}
          <div className="flex items-center gap-sm flex-wrap">
            <Link
              to={withLocale(`/experiments/monitor/themen/${hotTopic.topic}`)}
              className="inline-flex items-center gap-xs text-xs font-medium px-2 py-0.5 rounded-full no-underline hover:opacity-80 transition-opacity"
              style={{
                color: TOPIC_COLORS[hotTopic.topic],
                backgroundColor: `${TOPIC_COLORS[hotTopic.topic]}15`,
              }}
            >
              <hotTopicConfig.icon className="h-3 w-3" />
              {hotTopicConfig.name}
            </Link>
          </div>
        </div>

        {briefing?.briefing ? (
          <div className="mt-md pt-md border-t border-grey-100 dark:border-grey-800">
            <div className="flex items-center gap-xs mb-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary-500" />
              <span className="text-xs font-semibold text-grey-500 uppercase tracking-wide">
                KI-Einordnung
              </span>
              {briefing.generatedAt && (
                <span className="text-[10px] text-grey-400">
                  ·{' '}
                  {new Date(briefing.generatedAt).toLocaleString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <CitationTextRenderer
              text={briefing.briefing}
              citations={briefingCitations}
              className="text-sm leading-relaxed"
              linkConfig={MONITOR_CITATION_LINK_CONFIG}
            />
            {briefingCitations.length > 0 && (
              <CitationSourcesDisplay
                citations={briefingCitations}
                linkConfig={MONITOR_CITATION_LINK_CONFIG}
                className="mt-sm"
              />
            )}
          </div>
        ) : briefingLoading ? (
          <div className="mt-md pt-md border-t border-grey-100 dark:border-grey-800 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
