import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  WordCloud,
  type WordCloudItem,
} from '@gruenerator/ui';

import { TOPIC_COLORS, TOPIC_CONFIG } from '../topicConfig';

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

const DEFAULT_COLOR = '#94a3b8';

function getColor(topic: string | null): string {
  return topic ? TOPIC_COLORS[topic] || DEFAULT_COLOR : DEFAULT_COLOR;
}

export function KeywordRanking({ keywords, totalArticles, sourcesCount }: KeywordRankingProps) {
  const top40 = keywords.slice(0, 40);
  if (top40.length === 0) return null;

  const items: WordCloudItem[] = top40.map((k) => {
    const topicName = k.topic ? TOPIC_CONFIG[k.topic]?.name : null;
    return {
      key: k.keyword,
      label: k.keyword,
      value: k.count,
      color: getColor(k.topic),
      tooltip: (
        <>
          <p className="font-medium">{k.keyword}</p>
          <p className="text-xs text-grey-400">
            {k.count} Nennungen{topicName ? ` · ${topicName}` : ''}
          </p>
        </>
      ),
    };
  });

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
        <WordCloud items={items} />
      </CardContent>
    </Card>
  );
}
