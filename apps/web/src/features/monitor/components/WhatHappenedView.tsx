import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBanner,
  Switch,
} from '@gruenerator/ui';
import { ChevronDown, ExternalLink, Inbox, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import useUserDefaults from '../../../hooks/useUserDefaults';
import { BUNDESLAENDER } from '../bundeslaender';
import { useWhatHappened, useWhatHappenedSummary } from '../hooks/useMonitor';

import type { MonitorLocale } from '../hooks/useMonitor';
import type {
  SyncArticleEventType,
  SyncArticleSourceGroup,
  WhatHappenedArticle,
} from '@gruenerator/contracts';

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

function groupLabel(article: WhatHappenedArticle): string {
  if (article.landesverband) return LV_NAMES[article.landesverband] ?? article.landesverband;
  return SOURCE_GROUP_LABELS[article.sourceGroupId] ?? article.sourceName;
}

function ArticleRow({
  article,
  expertMode,
}: {
  article: WhatHappenedArticle;
  expertMode: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-sm py-xs">
      <div className="min-w-0">
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-foreground hover:text-primary-600 hover:underline inline-flex items-start gap-xs"
        >
          <span className="leading-snug">{article.title}</span>
          <ExternalLink className="h-3 w-3 mt-1 shrink-0 text-grey-400" />
        </a>
        {expertMode && (
          <p className="text-[11px] text-grey-400 mt-0.5">
            {article.collection}
            {article.syncRunUrl && (
              <>
                {' · '}
                <a
                  href={article.syncRunUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Sync-Lauf
                </a>
              </>
            )}
          </p>
        )}
      </div>
      {article.eventType === 'updated' && (
        <span className="text-[10px] text-grey-400 shrink-0 mt-1">aktualisiert</span>
      )}
    </li>
  );
}

function DaySummary({ date, locale }: { date: string; locale: MonitorLocale }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useWhatHappenedSummary(date, locale, open);

  return (
    <div className="rounded-md border border-grey-100 dark:border-grey-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-sm px-sm py-xs text-left hover:bg-grey-50 dark:hover:bg-grey-800/30 rounded-md"
      >
        <span className="inline-flex items-center gap-xs text-xs font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary-500" />
          Grünerator-Zusammenfassung
        </span>
        <ChevronDown
          className={`h-4 w-4 text-grey-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-sm pb-sm">
          {isLoading && (
            <div className="space-y-2 pt-xs">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[75%]" />
            </div>
          )}
          {error && (
            <p className="text-xs text-grey-400 pt-xs">
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

export function WhatHappenedView({ locale }: WhatHappenedViewProps) {
  const { get: getMonitorDefault, set: setMonitorDefault } = useUserDefaults<boolean>('monitor');
  const expertMode = getMonitorDefault('expertMode', false);

  const [days, setDays] = useState(7);
  const [sourceGroup, setSourceGroup] = useState<string>(ALL);
  const [landesverband, setLandesverband] = useState<string>(ALL);
  const [eventType, setEventType] = useState<string>(ALL);

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
      <div className="flex items-start justify-between gap-sm mb-lg flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Was ist passiert</h2>
          <p className="text-sm text-grey-500">
            Neue Inhalte, die der Content-Sync in die Notebooks aufgenommen hat — letzte{' '}
            {expertMode ? days : 7} Tage.
          </p>
        </div>
        <label className="flex items-center gap-sm text-sm text-grey-500 cursor-pointer mt-1">
          Expertenmodus
          <Switch
            checked={expertMode}
            onCheckedChange={(checked) => void setMonitorDefault('expertMode', checked)}
          />
        </label>
      </div>

      {expertMode && (
        <div className="flex flex-wrap gap-sm mb-lg">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="14">14 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceGroup} onValueChange={setSourceGroup}>
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
            <Select value={landesverband} onValueChange={setLandesverband}>
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
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Neu + aktualisiert</SelectItem>
              <SelectItem value="stored">Nur neu</SelectItem>
              <SelectItem value="updated">Nur aktualisiert</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <StatusBanner variant="error" className="mb-lg">
          Neue Inhalte konnten nicht geladen werden. Bitte versuche es später erneut.
        </StatusBanner>
      )}

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {data && data.days.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-sm py-2xl text-grey-400">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">Im gewählten Zeitraum wurden keine neuen Inhalte aufgenommen.</p>
          </CardContent>
        </Card>
      )}

      {data?.days.map((day) => {
        const groups = new Map<string, WhatHappenedArticle[]>();
        for (const article of day.articles) {
          const label = groupLabel(article);
          const list = groups.get(label) ?? [];
          list.push(article);
          groups.set(label, list);
        }

        return (
          <Card key={day.date} className="mb-lg">
            <CardHeader>
              <CardTitle className="text-base">{formatDay(day.date)}</CardTitle>
              {expertMode && (
                <CardDescription>
                  {day.counts.stored} neu
                  {day.counts.updated > 0 && `, ${day.counts.updated} aktualisiert`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <DaySummary date={day.date} locale={locale} />
              {[...groups.entries()].map(([label, articles]) => (
                <div key={label}>
                  <div className="flex items-center gap-sm mb-xs">
                    <Badge variant="secondary">{label}</Badge>
                    <span className="text-[11px] text-grey-400">{articles.length} Artikel</span>
                  </div>
                  <ul className="divide-y divide-grey-100 dark:divide-grey-800">
                    {articles.map((article) => (
                      <ArticleRow
                        key={article.sourceUrl}
                        article={article}
                        expertMode={expertMode}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
