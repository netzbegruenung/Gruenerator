import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CollapsibleSection,
  LoadingSection,
  MoodBar,
  getMoodLabel,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gruenerator/ui';
import { useMemo } from 'react';

import { EMOTION_CONFIG, EMOTION_KEYS, getMoodPosition } from '../emotionConfig';
import { useStimmung } from '../hooks/useMonitor';
import { TOPIC_CONFIG } from '../topicConfig';

import type { MonitorLocale } from '../hooks/useMonitor';

interface StimmungViewProps {
  locale: MonitorLocale;
}

function EmotionCard({
  emotionKey,
  score,
  maxScore,
  isStrongest,
}: {
  emotionKey: string;
  score: number;
  maxScore: number;
  isStrongest: boolean;
}) {
  const config = EMOTION_CONFIG[emotionKey];
  if (!config) return null;
  const Icon = config.icon;

  const intensity = maxScore > 0 ? score / maxScore : 0;
  const bgAlpha = Math.round(Math.max(5, intensity * 25));
  const borderAlpha = Math.round(Math.max(10, intensity * 60));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`
            relative rounded-xl p-md transition-all duration-300 cursor-default
            ${isStrongest ? 'col-span-2 row-span-1 sm:col-span-2' : ''}
          `}
          style={{
            opacity: Math.max(0.3, intensity),
            border: `2px solid color-mix(in srgb, var(--color-${config.hue}-500) ${borderAlpha}%, transparent)`,
            backgroundColor: `color-mix(in srgb, var(--color-${config.hue}-500) ${bgAlpha}%, transparent)`,
          }}
        >
          <div
            className={`flex ${isStrongest ? 'flex-row items-center gap-md' : 'flex-col items-center gap-xs'}`}
          >
            <div
              className={`
                flex items-center justify-center rounded-lg shrink-0
                ${isStrongest ? 'h-14 w-14' : 'h-12 w-12'}
              `}
              style={{
                backgroundColor: `color-mix(in srgb, var(--color-${config.hue}-500) ${Math.round(intensity * 20 + 5)}%, transparent)`,
              }}
            >
              <Icon
                className={isStrongest ? 'h-7 w-7' : 'h-6 w-6'}
                style={{ color: `var(--color-${config.hue}-500)` }}
              />
            </div>
            <div className={isStrongest ? '' : 'text-center'}>
              <span
                className={`block font-semibold ${isStrongest ? 'text-base' : 'text-sm'} text-foreground`}
              >
                {config.name}
              </span>
              {isStrongest && (
                <span className="block text-xs text-grey-500 mt-0.5">{config.comms}</span>
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">
          {config.name}: {score.toFixed(1)}
        </p>
        <p className="text-xs text-grey-400">{config.comms}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function HeatmapTable({
  rows,
  labelKey,
  labelTransform,
}: {
  rows: Array<{ emotions: Record<string, number>; articleCount: number; [key: string]: unknown }>;
  labelKey: string;
  labelTransform?: (label: string) => string;
}) {
  return (
    <div className="overflow-x-auto -mx-md">
      <TooltipProvider delayDuration={100}>
        <table className="w-full text-xs border-separate" style={{ borderSpacing: '2px' }}>
          <thead>
            <tr>
              <th className="text-left pb-xs pl-md pr-sm text-grey-500 font-normal" />
              {EMOTION_KEYS.map((e) => {
                const c = EMOTION_CONFIG[e];
                if (!c) return null;
                const Icon = c.icon;
                return (
                  <th key={e} className="pb-xs px-0.5 text-center font-normal">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center gap-0.5">
                          <Icon
                            className="h-3.5 w-3.5"
                            style={{ color: `var(--color-${c.hue}-500)` }}
                          />
                          <span className="text-[10px] text-grey-400">{c.name.slice(0, 3)}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{c.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = String(row[labelKey]);
              const displayLabel = labelTransform ? labelTransform(label) : label;

              const vals = EMOTION_KEYS.map((e) => row.emotions[e] ?? 0);
              const nonZero = vals.filter((v) => v > 0);
              const rowMax = Math.max(...nonZero, 1);
              const rowMin = Math.min(...(nonZero.length > 1 ? nonZero : [0]));
              const range = rowMax - rowMin || 1;

              return (
                <tr key={label}>
                  <td className="py-2 pl-md pr-sm text-foreground font-medium whitespace-nowrap">
                    {displayLabel}
                  </td>
                  {EMOTION_KEYS.map((e, i) => {
                    const val = vals[i];
                    const hue = EMOTION_CONFIG[e]?.hue ?? 'grey';
                    const isMax = val > 0 && val === rowMax;

                    if (val === 0) {
                      return (
                        <td key={e} className="py-2 px-0.5 text-center">
                          <span className="text-grey-300">&mdash;</span>
                        </td>
                      );
                    }

                    const normalized = (val - rowMin) / range;
                    const bgAlpha = Math.round(10 + normalized * 35);

                    return (
                      <td
                        key={e}
                        className={`py-2 px-1 text-center rounded-sm transition-colors ${isMax ? 'font-bold' : ''}`}
                        style={{
                          backgroundColor: `color-mix(in srgb, var(--color-${hue}-500) ${bgAlpha}%, transparent)`,
                        }}
                        title={`${EMOTION_CONFIG[e]?.name}: ${val.toFixed(1)}`}
                      >
                        <span className={isMax ? 'text-foreground' : 'text-foreground/70'}>
                          {val.toFixed(0)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TooltipProvider>
    </div>
  );
}

export function StimmungView({ locale }: StimmungViewProps) {
  const { data, isLoading } = useStimmung(locale);

  const { sorted, maxScore, strongestKey } = useMemo(() => {
    if (!data) return { sorted: [], maxScore: 1, strongestKey: undefined };
    const s = EMOTION_KEYS.map((key) => ({ key, score: data.overall[key] ?? 0 })).sort(
      (a, b) => b.score - a.score
    );
    return { sorted: s, maxScore: s[0]?.score ?? 1, strongestKey: s[0]?.key };
  }, [data]);

  if (isLoading) return <LoadingSection />;
  if (!data || Object.keys(data.overall).length === 0) {
    return (
      <Card>
        <CardContent className="py-lg text-center text-sm text-grey-500">
          Keine Stimmungsdaten verfügbar. Starte einen Monitor-Refresh.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-lg">
      {/* Layer 1: Mood Indicator */}
      <Card>
        <CardHeader>
          <CardTitle>Stimmungsbarometer</CardTitle>
          <CardDescription>
            Emotionale Stimmung in {locale === 'at' ? 'österreichischen' : 'deutschen'}{' '}
            Nachrichtenmedien heute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-sm">
          <MoodBar position={getMoodPosition(data.overall)} />
          {data.moodSummary && (
            <p className="text-sm text-foreground/80 italic">{data.moodSummary}</p>
          )}
        </CardContent>
      </Card>

      {/* Layer 2: Emotion Cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-sm">
          {sorted.map(({ key, score }) => (
            <EmotionCard
              key={key}
              emotionKey={key}
              score={score}
              maxScore={maxScore}
              isStrongest={key === strongestKey}
            />
          ))}
        </div>
      </TooltipProvider>

      {/* Layer 3: Detail Tables (collapsed) */}
      <div className="space-y-sm">
        {data.byTopic.length > 0 && (
          <CollapsibleSection title="Stimmung nach Thema" bordered>
            <HeatmapTable
              rows={data.byTopic.slice(0, 10)}
              labelKey="topic"
              labelTransform={(t) => TOPIC_CONFIG[t as keyof typeof TOPIC_CONFIG]?.name ?? t}
            />
          </CollapsibleSection>
        )}

        {data.bySource.length > 0 && (
          <CollapsibleSection title="Stimmung nach Quelle" bordered>
            <HeatmapTable rows={data.bySource.slice(0, 8)} labelKey="source" />
          </CollapsibleSection>
        )}

        {data.byKeyword && data.byKeyword.length > 0 && (
          <CollapsibleSection title="Stimmung nach Keywords" bordered>
            <HeatmapTable rows={data.byKeyword} labelKey="keyword" />
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
