import { Button, StatusBanner, Tabs, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RotateCcw } from 'lucide-react';

import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useMonitorRefresh, useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

import type { MonitorLocale } from '../hooks/useMonitor';
import type { ReactNode } from 'react';

/**
 * Only /watcher still uses this chrome — Themen, Trends, Feed und Umfragen sind
 * auf `MonitorPageHeader` umgezogen. Die Union bleibt eine Union, damit ein
 * künftiger Rückkehrer sie erweitert statt sie neu zu erfinden.
 */
export type MonitorSection = 'watcher';

const SECTION_SUBTITLES: Record<MonitorSection, Record<MonitorLocale, string>> = {
  watcher: {
    de: 'Berichterstattung über die Grünen — Risiken und Chancen im Blick.',
    at: 'Berichterstattung über die Grünen — Risiken und Chancen im Blick.',
  },
};

interface MonitorShellProps {
  section: MonitorSection;
  children: ReactNode;
}

/**
 * Page chrome for /watcher — und nur noch dafür: Titel, DE/AT-Umschalter und
 * die Refresh-Knöpfe. Themen, Trends, Feed und Umfragen rendern stattdessen
 * `MonitorPageHeader` mit der Quernavigation; die Übersichtsseite, auf die
 * diese Chrome einmal zugeschnitten war, gibt es nicht mehr.
 */
export function MonitorShell({ section, children }: MonitorShellProps) {
  const queryClient = useQueryClient();
  const { locale, setLocale } = useMonitorLocaleParam();
  // Cache-shared with the page content — only feeds the counts + error banner.
  const { data: snapshot, error } = useMonitorSnapshot(locale);
  const refresh = useMonitorRefresh();

  return (
    <ErrorBoundary>
      <PageContainer title="Monitor" subtitle={SECTION_SUBTITLES[section][locale]} maxWidth="lg">
        <div className="flex items-center justify-between mb-lg flex-wrap gap-sm">
          <div className="flex items-center gap-sm">
            <Tabs value={locale} onValueChange={(v) => setLocale(v as MonitorLocale)}>
              <TabsList>
                <TabsTrigger value="de">
                  Deutschland
                  {snapshot?.articlesByLocale?.de ? ` (${snapshot.articlesByLocale.de})` : ''}
                </TabsTrigger>
                <TabsTrigger value="at">
                  Österreich
                  {snapshot?.articlesByLocale?.at ? ` (${snapshot.articlesByLocale.at})` : ''}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['monitor'] })}
              className="text-grey-400 hover:text-foreground"
              title="Daten neu laden"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {import.meta.env.DEV && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="text-red-400 hover:text-red-600"
                title="DEV: Kompletter Refresh (RSS + EventRegistry + NLP)"
              >
                <RotateCcw className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {error && (
          <StatusBanner variant="error" className="mb-lg">
            Monitor konnte nicht geladen werden. Bitte versuche es später erneut.
          </StatusBanner>
        )}

        {children}
      </PageContainer>
    </ErrorBoundary>
  );
}
