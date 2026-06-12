import { Button, StatusBanner, Tabs, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useMonitorRefresh, useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

import type { MonitorLocale } from '../hooks/useMonitor';
import type { ReactNode } from 'react';

export type MonitorSection = 'uebersicht' | 'themen' | 'umfragen' | 'watcher' | 'feed';

const SECTION_SUBTITLES: Record<MonitorSection, Record<MonitorLocale, string>> = {
  uebersicht: {
    de: 'Meistdiskutierte Themen in deutschen Nachrichtenmedien der letzten 24 Stunden.',
    at: 'Meistdiskutierte Themen in österreichischen Nachrichtenmedien der letzten 24 Stunden.',
  },
  themen: {
    de: 'Meistdiskutierte Themen in deutschen Nachrichtenmedien der letzten 24 Stunden.',
    at: 'Meistdiskutierte Themen in österreichischen Nachrichtenmedien der letzten 24 Stunden.',
  },
  umfragen: {
    de: 'Sonntagsfrage, Ländertrends und Meinungsbild.',
    at: 'Sonntagsfrage und Wahltrends für Österreich.',
  },
  watcher: {
    de: 'Berichterstattung über die Grünen — Risiken und Chancen im Blick.',
    at: 'Berichterstattung über die Grünen — Risiken und Chancen im Blick.',
  },
  feed: {
    de: 'Neue Inhalte aus grünen Quellen, täglich gesammelt.',
    at: 'Neue Inhalte aus grünen Quellen, täglich gesammelt.',
  },
};

interface MonitorShellProps {
  section: MonitorSection;
  children: ReactNode;
}

/**
 * Shared page chrome for all /monitor routes: title, locale switcher and the
 * refresh controls. Navigation into the sub-pages happens via the section
 * headers on the Übersicht (Workplace pattern); sub-pages get a back link.
 * Routes are flat (no router nesting in this app), so every monitor page
 * renders this wrapper.
 */
export function MonitorShell({ section, children }: MonitorShellProps) {
  const queryClient = useQueryClient();
  const { locale, setLocale, withLocale } = useMonitorLocaleParam();
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

          {section !== 'uebersicht' && (
            <Link
              to={withLocale('/monitor')}
              className="inline-flex items-center gap-1 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zur Übersicht
            </Link>
          )}
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
