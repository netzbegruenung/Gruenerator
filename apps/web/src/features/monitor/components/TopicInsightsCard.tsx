import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@gruenerator/ui';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { CitationTextRenderer, CitationSourcesDisplay } from '../../../components/common/Citation';
import { useKeywordInsights } from '../hooks/useMonitor';

import type { MonitorLocale, TopicScore } from '../hooks/useMonitor';

interface TopicInsightsCardProps {
  locale: MonitorLocale;
  topics: TopicScore[];
}

const LINK_CONFIG = {
  type: 'vectorDocument' as const,
  basePath: '/documents',
  linkKey: 'document_id',
  titleKey: 'document_title',
};

export function TopicInsightsCard({ locale, topics }: TopicInsightsCardProps) {
  // Reuse keyword insights but with topic names as keywords
  const topTopicNames = topics
    .filter((t) => t.articleCount > 0)
    .slice(0, 5)
    .map((t) => t.topic);

  const { data, isLoading } = useKeywordInsights(locale);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <Card className="mb-lg">
      <CardHeader>
        <div className="flex items-center gap-sm">
          <BookOpen className="h-4 w-4 text-primary-500" />
          <CardTitle>Das haben wir in der Vergangenheit dazu gesagt</CardTitle>
        </div>
        <CardDescription>
          Positionen aus Grünen-Programmen und -Dokumenten zu den aktuellen Top-Themen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[85%]" />
          </div>
        )}

        {data?.text && (
          <>
            <CitationTextRenderer
              text={data.text}
              citations={data.citations}
              className="text-sm leading-relaxed"
              linkConfig={LINK_CONFIG}
            />

            {data.citations.length > 0 && (
              <div className="mt-md border-t border-grey-200 pt-md dark:border-grey-700">
                <button
                  onClick={() => setSourcesOpen(!sourcesOpen)}
                  className="flex items-center gap-xs border-none bg-transparent cursor-pointer text-xs font-medium text-grey-500 hover:text-foreground transition-colors"
                >
                  {sourcesOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {data.citations.length} Quellen anzeigen
                </button>

                {sourcesOpen && (
                  <div className="mt-sm">
                    <CitationSourcesDisplay
                      sources={data.sources}
                      citations={data.citations}
                      linkConfig={LINK_CONFIG}
                      title=""
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
