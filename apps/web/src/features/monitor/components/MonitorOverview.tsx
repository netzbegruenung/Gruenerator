import { Card, CardContent, MoodBar, ProgressBar, Separator, Skeleton } from '@gruenerator/ui';
import { ArrowRight, Check, ChevronRight, Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import {
  useBriefingRefresh,
  useMonitorBriefing,
  useMonitorSnapshot,
  usePolls,
  useStimmung,
} from '../hooks/useMonitor';
import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

import { UmfragenView } from './UmfragenView';

import type { MonitorLocale } from '../hooks/useMonitor';
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

// ─── Main Overview ───────────────────────────────────────────────────

export function MonitorOverview({ locale, onTopicClick, onNavigateTab }: MonitorOverviewProps) {
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: briefing, isLoading: briefingLoading } = useMonitorBriefing(locale);
  const { data: stimmung } = useStimmung(locale);
  const briefingRefresh = useBriefingRefresh(locale);
  usePolls();

  const maxScore = snapshot ? Math.max(...snapshot.topics.map((t) => t.score), 1) : 1;

  return (
    <div>
      {/* Section 1: AI Daily Briefing */}
      <section className="mb-2xl">
        <div className="flex items-center gap-sm mb-sm">
          <Sparkles className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-semibold text-foreground-heading m-0">Tages-Briefing</h2>
        </div>
        {briefing?.generatedAt && (
          <p className="text-xs text-grey-400 mb-lg">
            KI-generierte Zusammenfassung · Stand{' '}
            {new Date(briefing.generatedAt).toLocaleString('de-DE', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        {briefingLoading ? (
          <div className="space-y-md">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[88%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[75%]" />
            <Skeleton className="h-4 w-[95%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        ) : briefing?.briefing ? (
          <div className="prose prose-lg dark:prose-invert max-w-none text-foreground leading-relaxed">
            <Markdown>{briefing.briefing}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-grey-400">
            Briefing wird beim nächsten Monitor-Refresh generiert.
          </p>
        )}
      </section>

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
        <UmfragenView />
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
