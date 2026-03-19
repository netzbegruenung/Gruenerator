import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gruenerator/ui';

import { TOPIC_CONFIG } from '../topicConfig';

import type { TopicCategory } from '../topicConfig';

interface KeywordEntry {
  keyword: string;
  count: number;
  topic: TopicCategory | null;
}

interface KeywordRankingProps {
  keywords: KeywordEntry[];
  totalArticles: number;
  sourcesCount: number;
}

const TOPIC_COLORS: Record<string, string> = {
  migration: '#f59e0b',
  klima: '#22c55e',
  wirtschaft: '#3b82f6',
  soziales: '#ec4899',
  sicherheit: '#6366f1',
  gesundheit: '#14b8a6',
  europa: '#8b5cf6',
  digital: '#06b6d4',
  bildung: '#f97316',
  finanzen: '#eab308',
  justiz: '#78716c',
  arbeit: '#84cc16',
  mobilitaet: '#0ea5e9',
};

const DEFAULT_COLOR = '#94a3b8';

function getColor(topic: string | null): string {
  return topic ? TOPIC_COLORS[topic] || DEFAULT_COLOR : DEFAULT_COLOR;
}

function getFontSize(count: number, maxCount: number, minCount: number): number {
  if (maxCount === minCount) return 1.4;
  const ratio = (count - minCount) / (maxCount - minCount);
  return 0.75 + ratio * 1.8; // 0.75rem to 2.55rem
}

function getOpacity(count: number, maxCount: number, minCount: number): number {
  if (maxCount === minCount) return 1;
  const ratio = (count - minCount) / (maxCount - minCount);
  return 0.45 + ratio * 0.55; // 0.45 to 1.0
}

export function KeywordRanking({ keywords, totalArticles, sourcesCount }: KeywordRankingProps) {
  const top40 = keywords.slice(0, 40);
  if (top40.length === 0) return null;

  const maxCount = top40[0].count;
  const minCount = top40[top40.length - 1].count;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyword-Ranking</CardTitle>
        <CardDescription>
          Top-Begriffe aus {totalArticles} Artikeln ({sourcesCount} Quellen). Farben zeigen die
          Themenkategorie, Größe die Häufigkeit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={150}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            {top40.map((k) => {
              const fontSize = getFontSize(k.count, maxCount, minCount);
              const opacity = getOpacity(k.count, maxCount, minCount);
              const color = getColor(k.topic);
              const topicName = k.topic ? TOPIC_CONFIG[k.topic]?.name : null;

              return (
                <Tooltip key={k.keyword}>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default font-semibold leading-tight transition-opacity hover:opacity-100"
                      style={{
                        fontSize: `${fontSize}rem`,
                        color,
                        opacity,
                      }}
                    >
                      {k.keyword}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{k.keyword}</p>
                    <p className="text-xs text-grey-400">
                      {k.count} Nennungen{topicName ? ` · ${topicName}` : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
