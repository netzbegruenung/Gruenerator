import { Card, CardContent, SectionHeader, Skeleton } from '@gruenerator/ui';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import { useEntitySummary } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** Compact watcher teaser: the AI media summary, linking into /experiments/monitor/watcher. */
export function WatcherSection() {
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const entityId = locale === 'at' ? 'gruene-at' : 'gruene';
  const { data, isLoading } = useEntitySummary(entityId, locale);

  // No coverage summary available — keep the feed clean instead of an empty card.
  if (!isLoading && !data?.summary) return null;

  return (
    <section className="mb-2xl">
      <SectionHeader
        title="Watcher"
        onTitleClick={() => navigate(withLocale('/experiments/monitor/watcher'))}
        actions={
          <Link
            to={withLocale('/experiments/monitor/watcher')}
            className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
          >
            Risiken & Chancen
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <Card>
        <CardContent className="pt-md pb-md">
          <div className="flex items-center gap-xs mb-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-grey-500 uppercase tracking-wide">
              Was sagen die Medien über die Grünen?
            </span>
            {data?.generatedAt && (
              <span className="text-[10px] text-grey-400">
                ·{' '}
                {new Date(data.generatedAt).toLocaleString('de-DE', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[80%]" />
            </div>
          ) : (
            <div className="relative max-h-48 overflow-hidden">
              <Markdown className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                {data?.summary ?? ''}
              </Markdown>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
