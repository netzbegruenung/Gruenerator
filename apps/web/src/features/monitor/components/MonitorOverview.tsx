import {
  ArticleCard,
  Card,
  CardContent,
  MoodBar,
  ProgressBar,
  Skeleton,
  TweetCard,
  TweetXIcon,
} from '@gruenerator/ui';
import { ChevronRight, Flame, RefreshCw, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { CitationSourcesDisplay, CitationTextRenderer } from '../../../components/common/Citation';
import { EMOTION_HUES, EMOTION_NAMES, getMoodPosition } from '../emotionConfig';
import {
  useBriefingRefresh,
  useMonitorBriefing,
  useMonitorSnapshot,
  useStimmung,
} from '../hooks/useMonitor';
import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

import { UmfragenView } from './UmfragenView';

import type { MonitorLocale } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

interface MonitorOverviewProps {
  locale: MonitorLocale;
  onTopicClick: (topic: TopicCategory) => void;
}

const BRIEFING_LINK_CONFIG = {
  type: 'vectorDocument' as const,
  basePath: '/documents',
  linkKey: 'document_id',
  titleKey: 'document_title',
};

export function MonitorOverview({ locale, onTopicClick }: MonitorOverviewProps) {
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: briefing, isLoading: briefingLoading } = useMonitorBriefing(locale);
  const briefingCitations = useMemo(
    () =>
      (briefing?.citations ?? []).map((c) => ({
        index: Number(c.id),
        document_title: c.title,
        source_url: c.url,
        cited_text: c.snippet,
      })),
    [briefing?.citations]
  );
  const { data: stimmung } = useStimmung(locale);
  const briefingRefresh = useBriefingRefresh(locale);

  const maxScore = snapshot ? Math.max(...snapshot.topics.map((t) => t.score), 1) : 1;

  const hotTopic = snapshot?.topics[0];
  const hotTopicConfig = hotTopic ? TOPIC_CONFIG[hotTopic.topic] : null;
  const topHeadline = hotTopic?.topArticles[0]?.title;
  const topicSearchQuery = hotTopicConfig?.description || hotTopicConfig?.name;

  return (
    <div>
      {/* Section 0: Hot Topic Hero */}
      {hotTopic && hotTopicConfig && (
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
                <span
                  className="inline-flex items-center gap-xs text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    color: TOPIC_COLORS[hotTopic.topic],
                    backgroundColor: `${TOPIC_COLORS[hotTopic.topic]}15`,
                  }}
                >
                  <hotTopicConfig.icon className="h-3 w-3" />
                  {hotTopicConfig.name}
                </span>
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
                  linkConfig={BRIEFING_LINK_CONFIG}
                />
                {briefingCitations.length > 0 && (
                  <CitationSourcesDisplay
                    citations={briefingCitations}
                    linkConfig={BRIEFING_LINK_CONFIG}
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
      )}

      {/* Section 1: Top Articles */}
      {hotTopic && hotTopic.topArticles.length > 0 && (
        <section className="mb-2xl">
          <h2 className="text-lg font-semibold text-foreground mb-md">Top-Artikel</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            {hotTopic.topArticles.slice(0, 3).map((article) => (
              <ArticleCard
                key={article.url}
                url={article.url}
                title={article.title}
                excerpt={article.excerpt}
                source={article.source}
                publishedAt={article.publishedAt}
                sentiment={article.erSentiment}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Tweet Suggestions */}
      <section className="mb-2xl">
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-lg font-semibold text-foreground">Tweet-Vorschläge</h2>
          <button
            onClick={() => briefingRefresh.mutate()}
            disabled={briefingRefresh.isPending}
            className="inline-flex items-center gap-1 text-xs text-grey-400 hover:text-foreground transition-colors border-none bg-transparent cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${briefingRefresh.isPending ? 'animate-spin' : ''}`}
            />
            {briefingRefresh.isPending ? 'Generiert…' : 'Neu generieren'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {[0, 1, 2].map((i) => {
            const tweet = briefing?.tweets?.[i];
            if (tweet) {
              const topicColor = TOPIC_COLORS[tweet.topic] || '#94a3b8';
              const topicName = TOPIC_CONFIG[tweet.topic as TopicCategory]?.name ?? tweet.topic;
              return (
                <TweetCard
                  key={i}
                  text={tweet.text}
                  hashtags={tweet.hashtags}
                  topicLabel={topicName}
                  topicColor={topicColor}
                />
              );
            }
            return (
              <div
                key={i}
                className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-dashed border-grey-300 dark:border-grey-600 p-lg bg-background opacity-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-sm">
                    <div className="h-10 w-10 rounded-full bg-grey-200 dark:bg-grey-700 shrink-0" />
                    <div className="space-y-1">
                      <div className="h-3 w-32 rounded bg-grey-200 dark:bg-grey-700" />
                      <div className="h-2.5 w-20 rounded bg-grey-100 dark:bg-grey-800" />
                    </div>
                  </div>
                  <TweetXIcon className="h-5 w-5 text-grey-200 dark:text-grey-700" />
                </div>
                <div className="flex-1 flex items-center justify-center min-h-[4rem]">
                  <p className="text-xs text-grey-400 text-center">
                    {briefingLoading ? 'Wird generiert…' : 'Nächster Refresh'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3+4: Top Themen + Stimmung side by side */}
      <section className="mb-2xl grid grid-cols-1 md:grid-cols-2 gap-lg items-start md:items-stretch">
        {snapshot && (
          <Card className="flex flex-col">
            <CardContent className="pt-md pb-md flex-1 flex flex-col">
              <h3 className="text-sm font-semibold text-grey-500 uppercase tracking-wide mb-sm">
                Top-Themen
              </h3>
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
                      <button
                        key={t.topic}
                        onClick={() => onTopicClick(t.topic)}
                        className="w-full flex items-center gap-sm px-sm py-1 rounded-md hover:bg-grey-50 dark:hover:bg-grey-800/50 transition-colors group text-left border-none bg-transparent cursor-pointer"
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
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {stimmung && Object.keys(stimmung.overall).length > 0 && (
          <Card className="flex flex-col">
            <CardContent className="pt-md pb-md flex-1">
              <h3 className="text-sm font-semibold text-grey-500 uppercase tracking-wide mb-sm">
                Stimmung
              </h3>
              <div className="px-sm mb-md">
                <MoodBar position={getMoodPosition(stimmung.overall)} />
              </div>
              <div className="space-y-0.5">
                {(() => {
                  const maxEmotion = Math.max(...Object.values(stimmung.overall), 1);
                  return Object.entries(stimmung.overall)
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, score]) => {
                      const name = EMOTION_NAMES[key];
                      const hue = EMOTION_HUES[key];
                      if (!name || !hue) return null;
                      const barValue = (score / maxEmotion) * 100;

                      return (
                        <div key={key} className="flex items-center gap-sm px-sm py-0.5">
                          <span className="text-xs text-foreground w-24 shrink-0">{name}</span>
                          <div className="flex-1">
                            <ProgressBar value={barValue} color={`var(--color-${hue}-500)`} />
                          </div>
                          <span className="text-[11px] text-grey-400 tabular-nums w-6 text-right shrink-0">
                            {Math.round(score)}
                          </span>
                        </div>
                      );
                    });
                })()}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 5: Sonntagsfrage */}
      <section className="mb-2xl">
        <UmfragenView locale={locale} />
      </section>
    </div>
  );
}
