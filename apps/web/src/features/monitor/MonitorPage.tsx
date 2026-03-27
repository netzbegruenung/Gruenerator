import { Button, LoadingSection, StatusBanner, Tabs, TabsList, TabsTrigger } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { KeywordInsightsCard } from './components/KeywordInsightsCard';
import { KeywordRanking } from './components/KeywordRanking';
import { MonitorOverview } from './components/MonitorOverview';
import { SocialTrends } from './components/SocialTrends';
import { StimmungView } from './components/StimmungView';
import { TopicDetail } from './components/TopicDetail';
import { TopicRanking } from './components/TopicRanking';
import { UmfragenView } from './components/UmfragenView';
import { WatcherView } from './components/WatcherView';
import {
  useKeywordInsights,
  useMonitorBriefing,
  useMonitorRefresh,
  useMonitorSnapshot,
  usePolls,
  useStimmung,
} from './hooks/useMonitor';

import type { MonitorLocale } from './hooks/useMonitor';
import type { TopicCategory } from './topicConfig';

type MonitorTab =
  | 'overview'
  | 'topics'
  | 'keywords'
  | 'social'
  | 'stimmung'
  | 'umfragen'
  | 'watcher'
  | 'details';

function MonitorPage() {
  const queryClient = useQueryClient();
  const authLocale = useAuthStore((s) => s.locale);
  const [locale, setLocale] = useState<MonitorLocale>(authLocale === 'de-AT' ? 'at' : 'de');
  const [tab, setTab] = useState<MonitorTab>('overview');
  const [selectedTopic, setSelectedTopic] = useState<TopicCategory | null>(null);
  const { data: snapshot, isLoading, error } = useMonitorSnapshot(locale);
  const refresh = useMonitorRefresh();
  useKeywordInsights(locale);
  useMonitorBriefing(locale);
  useStimmung(locale);
  usePolls();

  return (
    <ErrorBoundary>
      <PageContainer
        title="Monitor"
        subtitle={`Meistdiskutierte Themen in ${locale === 'at' ? 'österreichischen' : 'deutschen'} Nachrichtenmedien der letzten 24 Stunden.`}
        maxWidth="lg"
      >
        {selectedTopic ? (
          <TopicDetail
            topic={selectedTopic}
            locale={locale}
            onBack={() => setSelectedTopic(null)}
          />
        ) : (
          <>
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

              <Tabs value={tab} onValueChange={(v) => setTab(v as MonitorTab)}>
                <TabsList>
                  <TabsTrigger value="overview">Überblick</TabsTrigger>
                  <TabsTrigger value="topics">Themen</TabsTrigger>
                  <TabsTrigger value="stimmung">Stimmung</TabsTrigger>
                  <TabsTrigger value="umfragen">Umfragen</TabsTrigger>
                  <TabsTrigger value="watcher">Watcher</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {error && (
              <StatusBanner variant="error" className="mb-lg">
                Monitor konnte nicht geladen werden. Bitte versuche es später erneut.
              </StatusBanner>
            )}

            {isLoading && tab !== 'overview' && <LoadingSection />}

            {tab === 'overview' && (
              <MonitorOverview locale={locale} onTopicClick={setSelectedTopic} />
            )}

            {tab === 'stimmung' && <StimmungView locale={locale} />}

            {tab === 'umfragen' && <UmfragenView locale={locale} />}

            {tab === 'watcher' && <WatcherView locale={locale} />}

            {snapshot && (
              <>
                {tab === 'topics' && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-lg items-start">
                    <div>
                      <TopicRanking
                        topics={snapshot.topics}
                        totalArticles={snapshot.totalArticles}
                        sourcesCount={snapshot.sources.length}
                        onClick={setSelectedTopic}
                      />
                      {snapshot.keywords && snapshot.keywords.length > 0 && (
                        <div className="mt-xl">
                          <KeywordInsightsCard locale={locale} />
                          <KeywordRanking
                            keywords={snapshot.keywords}
                            totalArticles={snapshot.totalArticles}
                            sourcesCount={snapshot.sources.length}
                          />
                        </div>
                      )}
                    </div>
                    {snapshot.socialTrends && snapshot.socialTrends.length > 0 && (
                      <SocialTrends trends={snapshot.socialTrends} />
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(MonitorPage, { title: 'Monitor' });
