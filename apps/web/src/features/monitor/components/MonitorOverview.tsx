import { Card, CardContent, MoodBar, ProgressBar, Separator, Skeleton } from '@gruenerator/ui';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Flame,
  Library,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import {
  useBriefingRefresh,
  useKeywordInsights,
  useMonitorBriefing,
  useMonitorSnapshot,
  usePolls,
  useStimmung,
  useTopicArticles,
  useTopicDocuments,
} from '../hooks/useMonitor';
import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

import { UmfragenView } from './UmfragenView';

import type { MonitorArticle, MonitorLocale } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

type MonitorTab =
  | 'topics'
  | 'keywords'
  | 'social'
  | 'stimmung'
  | 'umfragen'
  | 'watcher'
  | 'details';

interface MonitorOverviewProps {
  locale: MonitorLocale;
  onTopicClick: (topic: TopicCategory) => void;
  onNavigateTab: (tab: MonitorTab) => void;
}

// ─── Stimmung helper (same as StimmungView) ──────────────────────────

const EMOTION_VALENCE: Record<string, 'positive' | 'negative'> = {
  angst: 'negative',
  wut: 'negative',
  hoffnung: 'positive',
  enttaeuschung: 'negative',
  vertrauen: 'positive',
  solidaritaet: 'positive',
  stolz: 'positive',
};

const EMOTION_NAMES: Record<string, string> = {
  angst: 'Angst',
  wut: 'Wut',
  hoffnung: 'Hoffnung',
  enttaeuschung: 'Enttäuschung',
  vertrauen: 'Vertrauen',
  solidaritaet: 'Solidarität',
  stolz: 'Stolz',
};

const EMOTION_HUES: Record<string, string> = {
  angst: 'red',
  wut: 'orange',
  hoffnung: 'green',
  enttaeuschung: 'blue',
  vertrauen: 'violet',
  solidaritaet: 'emerald',
  stolz: 'yellow',
};

function getMoodPosition(overall: Record<string, number>): number {
  let positive = 0;
  let negative = 0;
  for (const [key, score] of Object.entries(overall)) {
    const valence = EMOTION_VALENCE[key];
    if (!valence) continue;
    if (valence === 'positive') positive += score;
    else negative += score;
  }
  const total = positive + negative;
  if (total === 0) return 50;
  return (positive / total) * 100;
}

// ─── X/Twitter icon ──────────────────────────────────────────────────

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ─── Tweet Card (MagicUI-inspired) ───────────────────────────────────

function TweetCard({ tweet }: { tweet: { text: string; topic: string; hashtags: string[] } }) {
  const [copied, setCopied] = useState(false);
  const charCount = tweet.text.length;
  const topicColor = TOPIC_COLORS[tweet.topic] || '#94a3b8';
  const topicName = TOPIC_CONFIG[tweet.topic as keyof typeof TOPIC_CONFIG]?.name ?? tweet.topic;

  const handleCopy = async () => {
    const fullText =
      tweet.hashtags.length > 0
        ? `${tweet.text}\n\n${tweet.hashtags.map((h) => `#${h}`).join(' ')}`
        : tweet.text;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background">
      {/* Header: avatar + name + X icon */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-sm">
          <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">B90</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground m-0 leading-tight">
              Bündnis 90/Die Grünen
            </p>
            <p className="text-xs text-grey-400 m-0">@Die_Gruenen</p>
          </div>
        </div>
        <XIcon className="h-5 w-5 text-grey-300" />
      </div>

      {/* Tweet body */}
      <p className="text-[15px] leading-relaxed text-foreground m-0 flex-1">
        {tweet.text}
        {tweet.hashtags.length > 0 && (
          <span className="text-primary-500"> {tweet.hashtags.map((h) => `#${h}`).join(' ')}</span>
        )}
      </p>

      {/* Footer: topic tag + char count + copy */}
      <div className="flex items-center justify-between pt-sm border-t border-grey-100 dark:border-grey-800">
        <div className="flex items-center gap-sm">
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ color: topicColor, backgroundColor: `${topicColor}15` }}
          >
            {topicName}
          </span>
          <span
            className={`text-[10px] tabular-nums ${charCount > 260 ? 'text-red-500' : 'text-grey-400'}`}
          >
            {charCount}/280
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs text-grey-400 hover:text-foreground transition-colors border-none bg-transparent cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Kopiert
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Kopieren
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Document Card (article from Qdrant collections) ────────────────

const COLLECTION_COLORS: Record<string, string> = {
  'Grüne Bundestagsfraktion': '#22c55e',
  KommunalWiki: '#3b82f6',
  'Heinrich-Böll-Stiftung': '#f59e0b',
  'Grüne Österreich': '#22c55e',
  'Grüne Österreich (gruene.at)': '#16a34a',
};

function DocumentCard({
  doc,
}: {
  doc: {
    document_title: string;
    source_url: string;
    relevant_content: string;
    collection_name: string;
  };
}) {
  const color = COLLECTION_COLORS[doc.collection_name] || '#94a3b8';

  return (
    <a
      href={doc.source_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background no-underline group hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-sm">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Library className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs font-medium text-grey-500 truncate">{doc.collection_name}</span>
        <ExternalLink className="h-3 w-3 text-grey-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
      </div>

      <p className="text-sm font-semibold text-foreground-heading leading-snug m-0 line-clamp-2 group-hover:text-primary-600 transition-colors">
        {doc.document_title}
      </p>

      <p className="text-xs text-foreground/70 leading-relaxed m-0 line-clamp-3 flex-1">
        {doc.relevant_content?.slice(0, 200)}
      </p>

      <div className="pt-sm border-t border-grey-100 dark:border-grey-800">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ color, backgroundColor: `${color}15` }}
        >
          {doc.collection_name}
        </span>
      </div>
    </a>
  );
}

// ─── Hot Topic Content: News ticker + Documents ─────────────────────

function HotTopicContent({
  articles,
  keyword,
  locale,
}: {
  articles: MonitorArticle[];
  keyword?: string;
  locale: MonitorLocale;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const { data: documents = [] } = useTopicDocuments(keyword, locale);
  const [docIdx, setDocIdx] = useState(0);
  const docIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [docPaused, setDocPaused] = useState(false);

  const items = articles.filter((a) => a.title).slice(0, 10);

  const advance = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    intervalRef.current = setInterval(advance, 5000);
    return () => clearInterval(intervalRef.current);
  }, [paused, advance, items.length]);

  const advanceDoc = useCallback(() => {
    setDocIdx((prev) => (prev + 1) % documents.length);
  }, [documents.length]);

  useEffect(() => {
    if (docPaused || documents.length <= 1) return;
    docIntervalRef.current = setInterval(advanceDoc, 5000);
    return () => clearInterval(docIntervalRef.current);
  }, [docPaused, advanceDoc, documents.length]);

  const current = items[currentIdx];
  if (!current) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-md mb-md">
      {/* Left: auto-scrolling news headline */}
      <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
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
        {items.length > 1 && (
          <div className="flex items-center gap-1 mt-sm">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`h-1.5 rounded-full border-none cursor-pointer transition-all ${
                  i === currentIdx
                    ? 'w-4 bg-primary-500'
                    : 'w-1.5 bg-grey-300 dark:bg-grey-600 hover:bg-grey-400'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: document carousel */}
      <div onMouseEnter={() => setDocPaused(true)} onMouseLeave={() => setDocPaused(false)}>
        {documents.length > 0 ? (
          <>
            <DocumentCard doc={documents[docIdx % documents.length]} />
            {documents.length > 1 && (
              <div className="flex items-center gap-1 mt-sm">
                {documents.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setDocIdx(i)}
                    className={`h-1.5 rounded-full border-none cursor-pointer transition-all ${
                      i === docIdx
                        ? 'w-4 bg-primary-500'
                        : 'w-1.5 bg-grey-300 dark:bg-grey-600 hover:bg-grey-400'
                    }`}
                  />
                ))}
              </div>
            )}
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

// ─── Main Overview ───────────────────────────────────────────────────

export function MonitorOverview({ locale, onTopicClick, onNavigateTab }: MonitorOverviewProps) {
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: briefing, isLoading: briefingLoading } = useMonitorBriefing(locale);
  const { data: stimmung } = useStimmung(locale);
  const briefingRefresh = useBriefingRefresh(locale);
  usePolls();

  const maxScore = snapshot ? Math.max(...snapshot.topics.map((t) => t.score), 1) : 1;

  const hotTopic = snapshot?.topics[0];
  const hotTopicConfig = hotTopic ? TOPIC_CONFIG[hotTopic.topic] : null;
  const hotTopicEmotion = useMemo(() => {
    if (!stimmung?.byTopic || !hotTopic) return null;
    const topicStimmung = stimmung.byTopic.find((t) => t.topic === hotTopic.topic);
    if (!topicStimmung) return null;
    const sorted = Object.entries(topicStimmung.emotions).sort(([, a], [, b]) => b - a);
    return sorted[0]
      ? { key: sorted[0][0], name: EMOTION_NAMES[sorted[0][0]] || sorted[0][0] }
      : null;
  }, [stimmung, hotTopic]);

  return (
    <div>
      {/* Section 0: Hot Topic Hero */}
      {hotTopic &&
        hotTopicConfig &&
        (() => {
          const topKeyword = snapshot?.keywords?.[0]?.keyword;
          return (
            <section className="mb-2xl">
              <div className="rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background">
                {/* Big keyword + topic badge */}
                <div className="mb-md">
                  {topKeyword && (
                    <h2 className="flex items-center gap-sm text-3xl sm:text-4xl font-black text-foreground-heading m-0 mb-xs capitalize">
                      <Flame className="h-7 w-7 text-orange-500 shrink-0" />
                      {topKeyword}
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
                    <span className="text-xs text-grey-500">{hotTopic.articleCount} Artikel</span>
                    {hotTopicEmotion && (
                      <span className="text-xs text-grey-400">
                        · {hotTopicEmotion.name} dominiert
                      </span>
                    )}
                    <button
                      onClick={() => onTopicClick(hotTopic.topic)}
                      className="ml-auto text-xs text-primary-600 hover:underline border-none bg-transparent cursor-pointer flex items-center gap-0.5"
                    >
                      Alle Artikel <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* News ticker + Party position */}
                <HotTopicContent
                  articles={hotTopic.topArticles}
                  keyword={topKeyword}
                  locale={locale}
                />

                {/* AI Briefing — embedded in Hot Topic */}
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
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                      <Markdown>{briefing.briefing}</Markdown>
                    </div>
                  </div>
                ) : briefingLoading ? (
                  <div className="mt-md pt-md border-t border-grey-100 dark:border-grey-800 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[80%]" />
                  </div>
                ) : null}

                {/* AI mood summary */}
                {stimmung?.moodSummary && (
                  <p className="mt-sm text-xs text-foreground/70 italic">{stimmung.moodSummary}</p>
                )}
              </div>
            </section>
          );
        })()}

      {/* Section 2: Tweet Suggestions — always show 3 slots */}
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
            if (tweet) return <TweetCard key={i} tweet={tweet} />;
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
                  <XIcon className="h-5 w-5 text-grey-200 dark:text-grey-700" />
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
        {/* Top Themen */}
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

        {/* Stimmungsbarometer + Emotion Ranking */}
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
                {Object.entries(stimmung.overall)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, score]) => {
                    const name = EMOTION_NAMES[key];
                    const hue = EMOTION_HUES[key];
                    if (!name || !hue) return null;
                    const maxEmotion = Math.max(...Object.values(stimmung.overall), 1);
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
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 5: Sonntagsfrage */}
      <section className="mb-2xl">
        <UmfragenView locale={locale} />
      </section>

      {/* Section 6: Quick Links */}
      <Separator className="mb-lg" />
      <div className="flex flex-wrap gap-lg">
        {(
          [
            { label: 'Alle Themen', tab: 'topics' as const },
            { label: 'Keyword-Analyse', tab: 'keywords' as const },
            { label: 'X/Twitter Trends', tab: 'social' as const },
            { label: 'Stimmungsanalyse', tab: 'stimmung' as const },
            { label: 'Watcher', tab: 'watcher' as const },
          ] as const
        ).map((link) => (
          <button
            key={link.tab}
            onClick={() => onNavigateTab(link.tab)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors inline-flex items-center gap-1 border-none bg-transparent cursor-pointer"
          >
            {link.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
