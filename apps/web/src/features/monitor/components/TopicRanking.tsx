import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

import type { TopicScore } from '../hooks/useMonitor';
import type { TopicCategory } from '../topicConfig';

interface TopicRankingProps {
  topics: TopicScore[];
  totalArticles: number;
  sourcesCount: number;
  onClick: (topic: TopicCategory) => void;
}

export function TopicRanking({ topics, totalArticles, sourcesCount, onClick }: TopicRankingProps) {
  const { chartData, chartConfig } = useMemo(() => {
    const active = topics.filter((t) => t.articleCount > 0);
    return {
      chartData: active.map((t) => ({
        topic: t.topic,
        articles: t.articleCount,
        fill: TOPIC_COLORS[t.topic] || '#888',
      })),
      chartConfig: {
        articles: { label: 'Artikel' },
        ...Object.fromEntries(
          active.map((t) => [
            t.topic,
            {
              label: TOPIC_CONFIG[t.topic]?.name ?? t.topic,
              color: TOPIC_COLORS[t.topic] || '#888',
            },
          ])
        ),
      } satisfies ChartConfig,
    };
  }, [topics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Themen-Ranking</CardTitle>
        <CardDescription>
          {totalArticles} Artikel aus {sourcesCount} Quellen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 0 }}>
            <YAxis
              dataKey="topic"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={110}
              tickFormatter={(value: string) => TOPIC_CONFIG[value as TopicCategory]?.name ?? value}
            />
            <XAxis dataKey="articles" type="number" hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar
              dataKey="articles"
              layout="vertical"
              radius={5}
              onClick={(data) => {
                if (data?.topic) onClick(data.topic as TopicCategory);
              }}
              className="cursor-pointer"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
