import {
  ArticleCard,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBanner,
  Switch,
} from '@gruenerator/ui';
import { ChevronDown, Inbox, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import useUserDefaults from '../../../hooks/useUserDefaults';
import { BUNDESLAENDER } from '../bundeslaender';
import { useWhatHappened, useWhatHappenedSummary } from '../hooks/useMonitor';

import type { MonitorLocale } from '../hooks/useMonitor';
import type { SyncArticleEventType, SyncArticleSourceGroup } from '@gruenerator/contracts';

interface WhatHappenedViewProps {
  locale: MonitorLocale;
}

const SOURCE_GROUP_LABELS: Record<SyncArticleSourceGroup, string> = {
  landesverbaende: 'Landesverbände',
  gruenblog: 'Grünblog',
  'gruene-at': 'Grüne Österreich',
  kommunalwiki: 'KommunalWiki',
  'boell-stiftung': 'Böll-Stiftung',
  bundestag: 'Bundestagsfraktion',
};

// Scraper LV codes are mostly Bundesland shorts; LSA is the odd one out.
const LV_NAMES: Record<string, string> = {
  ...Object.fromEntries(BUNDESLAENDER.map((b) => [b.short, b.name])),
  LSA: 'Sachsen-Anhalt',
};

const ALL = 'all';

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** AI digest for one day, styled like the Überblick "KI-Einordnung" block. */
function DaySummary({ date, locale }: { date: string; locale: MonitorLocale }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useWhatHappenedSummary(date, locale, open);

  return (
    <div className="rounded-xl border border-grey-200 dark:border-grey-700 bg-background mb-md">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-sm px-md py-sm text-left border-none bg-transparent cursor-pointer rounded-xl hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors"
      >
        <span className="inline-flex items-center gap-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary-500" />
          <span className="text-xs font-semibold text-grey-500 uppercase tracking-wide">
            KI-Zusammenfassung
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
        </span>
        <ChevronDown
          className={`h-4 w-4 text-grey-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-md pb-md border-t border-grey-100 dark:border-grey-800 pt-sm">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[80%]" />
            </div>
          )}
          {error && (
            <p className="text-xs text-grey-400 m-0">
              Zusammenfassung konnte nicht erstellt werden.
            </p>
          )}
          {data && (
            <Markdown className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
              {data.summary}
            </Markdown>
          )}
        </div>
      )}
    </div>
  );
}

const VALID_DAYS = [7, 14, 30];
const VALID_EVENT_TYPES = ['stored', 'updated'];

export function WhatHappenedView({ locale }: WhatHappenedViewProps) {
  const { get: getMonitorDefault, set: setMonitorDefault } = useUserDefaults<boolean>('monitor');
  const expertMode = getMonitorDefault('expertMode', false);

  // Filters live in the URL so feed views are shareable; absent = all/7 days.
  const [searchParams, setSearchParams] = useSearchParams();
  const daysParam = Number(searchParams.get('days'));
  const days = VALID_DAYS.includes(daysParam) ? daysParam : 7;
  const sourceGroup = searchParams.get('sourceGroup') ?? ALL;
  const landesverband = searchParams.get('landesverband') ?? ALL;
  const eventTypeParam = searchParams.get('eventType');
  const eventType =
    eventTypeParam !== null && VALID_EVENT_TYPES.includes(eventTypeParam) ? eventTypeParam : ALL;

  // Functional form so the monitor ?locale= param is never clobbered;
  // defaults are deleted to keep URLs clean.
  const setFilter = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const filters = expertMode
    ? {
        days,
        ...(sourceGroup !== ALL && { sourceGroup: sourceGroup as SyncArticleSourceGroup }),
        ...(landesverband !== ALL && { landesverband }),
        ...(eventType !== ALL && { eventType: eventType as SyncArticleEventType }),
      }
    : { days: 7 };

  const { data, isLoading, error } = useWhatHappened(locale, filters);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-sm mb-xl">
        {expertMode && (
          <>
            <Select
              value={String(days)}
              onValueChange={(v) => setFilter('days', v === '7' ? null : v)}
            >
              <SelectTrigger className="w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="14">14 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sourceGroup}
              onValueChange={(v) => setFilter('sourceGroup', v === ALL ? null : v)}
            >
              <SelectTrigger className="w-[13rem]">
                <SelectValue placeholder="Quelle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Quellen</SelectItem>
                {(data?.sourceGroups ?? []).map((g) => (
                  <SelectItem key={g} value={g}>
                    {SOURCE_GROUP_LABELS[g] ?? g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(data?.landesverbaende.length ?? 0) > 0 && (
              <Select
                value={landesverband}
                onValueChange={(v) => setFilter('landesverband', v === ALL ? null : v)}
              >
                <SelectTrigger className="w-[13rem]">
                  <SelectValue placeholder="Landesverband" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Landesverbände</SelectItem>
                  {(data?.landesverbaende ?? []).map((lv) => (
                    <SelectItem key={lv} value={lv}>
                      {LV_NAMES[lv] ?? lv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={eventType}
              onValueChange={(v) => setFilter('eventType', v === ALL ? null : v)}
            >
              <SelectTrigger className="w-[10rem]">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Neu + aktualisiert</SelectItem>
                <SelectItem value="stored">Nur neu</SelectItem>
                <SelectItem value="updated">Nur aktualisiert</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <label className="ml-auto flex items-center gap-sm text-xs text-grey-400 cursor-pointer shrink-0">
          Expertenmodus
          <Switch
            checked={expertMode}
            onCheckedChange={(checked) => void setMonitorDefault('expertMode', checked)}
          />
        </label>
      </div>

      {error && (
        <StatusBanner variant="error" className="mb-lg">
          Neue Inhalte konnten nicht geladen werden. Bitte versuche es später erneut.
        </StatusBanner>
      )}

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-6 w-56" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        </div>
      )}

      {data && data.days.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-sm py-2xl text-grey-400">
            <Inbox className="h-8 w-8" />
            <p className="text-sm m-0">
              Im gewählten Zeitraum wurden keine neuen Inhalte aufgenommen.
            </p>
          </CardContent>
        </Card>
      )}

      {data?.days.map((day) => (
        <section key={day.date} className="mb-2xl">
          <div className="flex items-baseline justify-between gap-sm mb-md">
            <h2 className="text-lg font-semibold text-foreground m-0">{formatDay(day.date)}</h2>
            <span className="text-xs text-grey-400 shrink-0">
              {day.counts.stored} neu
              {day.counts.updated > 0 && `, ${day.counts.updated} aktualisiert`}
            </span>
          </div>

          <DaySummary date={day.date} locale={locale} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {day.articles.map((article) => (
              <ArticleCard
                key={article.sourceUrl}
                url={article.sourceUrl}
                title={article.title}
                excerpt={article.excerpt ?? undefined}
                source={article.sourceName}
                publishedAt={article.publishedAt ?? article.indexedAt}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
