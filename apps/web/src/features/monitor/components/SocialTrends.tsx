import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gruenerator/ui';
import { ExternalLink } from 'lucide-react';

interface SocialTrend {
  rank: number;
  name: string;
  url: string;
}

interface SocialTrendsProps {
  trends: SocialTrend[];
}

function getFontSize(rank: number): string {
  if (rank <= 3) return 'text-xl font-bold';
  if (rank <= 10) return 'text-base font-semibold';
  if (rank <= 20) return 'text-sm font-medium';
  return 'text-xs';
}

function getOpacity(rank: number): number {
  if (rank <= 5) return 1;
  if (rank <= 15) return 0.8;
  if (rank <= 30) return 0.6;
  return 0.45;
}

export function SocialTrends({ trends }: SocialTrendsProps) {
  if (!trends || trends.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>X/Twitter Trends</CardTitle>
        <CardDescription>
          Top {trends.length} Trends in Deutschland auf X (Twitter) gerade jetzt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          {trends.map((t) => (
            <a
              key={t.rank}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${getFontSize(t.rank)} text-primary-500 no-underline hover:underline transition-opacity`}
              style={{ opacity: getOpacity(t.rank) }}
              title={`#${t.rank} Trend`}
            >
              {t.name}
              {t.rank <= 3 && <ExternalLink className="ml-0.5 mb-0.5 inline h-3 w-3" />}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
