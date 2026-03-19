import {
  Button,
  CardGrid,
  LoadingSection,
  StatusBanner,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { KeywordInsightsCard } from './components/KeywordInsightsCard';
import { KeywordRanking } from './components/KeywordRanking';
import { MonitorOverview } from './components/MonitorOverview';
import { SocialTrends } from './components/SocialTrends';
import { StimmungView } from './components/StimmungView';
import { TopicCard } from './components/TopicCard';
import { TopicDetail } from './components/TopicDetail';
import { TopicRanking } from './components/TopicRanking';
import { TopicTrendBar } from './components/TopicTrendBar';
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
  | 'social'
  | 'stimmung'
  | 'umfragen'
  | 'watcher'
  | 'details';

function MonitorPage() {
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

  const maxScore = useMemo(
    () => (snapshot ? Math.max(...snapshot.topics.map((t) => t.score), 1) : 1),
    [snapshot]
  );

  return (
    <ErrorBoundary>
      <PageContainer
        title="Themen-Monitor"
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
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                  className="text-grey-400 hover:text-foreground"
                >
                  <RefreshCw className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as MonitorTab)}>
                <TabsList>
                  <TabsTrigger value="overview">Überblick</TabsTrigger>
                  <TabsTrigger value="topics">Themen</TabsTrigger>
                  <TabsTrigger value="social">X/Twitter</TabsTrigger>
                  <TabsTrigger value="stimmung">Stimmung</TabsTrigger>
                  <TabsTrigger value="umfragen">Umfragen</TabsTrigger>
                  <TabsTrigger value="watcher">Watcher</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {error && (
              <StatusBanner variant="error" className="mb-lg">
                Themen-Monitor konnte nicht geladen werden. Bitte versuche es später erneut.
              </StatusBanner>
            )}

            {isLoading && tab !== 'overview' && <LoadingSection />}

            {tab === 'overview' && (
              <MonitorOverview
                locale={locale}
                onTopicClick={setSelectedTopic}
                onNavigateTab={setTab}
              />
            )}

            {tab === 'stimmung' && <StimmungView locale={locale} />}

            {tab === 'umfragen' && <UmfragenView />}

            {tab === 'watcher' && <WatcherView locale={locale} />}

            {snapshot && (
              <>
                {tab === 'topics' && (
                  <>
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
                  </>
                )}

                {tab === 'social' && snapshot.socialTrends && (
                  <SocialTrends trends={snapshot.socialTrends} />
                )}

                {tab === 'details' && (
                  <>
                    <TopicTrendBar topics={snapshot.topics} />
                    <p className="mb-md text-xs text-grey-500 dark:text-grey-400">
                      {snapshot.totalArticles} Artikel aus {snapshot.sources.length} Quellen
                      {' · '}
                      Stand:{' '}
                      {new Date(snapshot.createdAt).toLocaleString('de-DE', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <CardGrid columns="3">
                      {snapshot.topics.map((topicScore) => (
                        <TopicCard
                          key={topicScore.topic}
                          topicScore={topicScore}
                          maxScore={maxScore}
                          onClick={setSelectedTopic}
                        />
                      ))}
                    </CardGrid>
                  </>
                )}
              </>
            )}
          </>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(MonitorPage, { title: 'Themen-Monitor' });
