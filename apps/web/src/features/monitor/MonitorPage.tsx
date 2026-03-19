import {
  CardGrid,
  LoadingSection,
  StatusBanner,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { KeywordInsightsCard } from './components/KeywordInsightsCard';
import { KeywordRanking } from './components/KeywordRanking';
import { SocialTrends } from './components/SocialTrends';
import { TopicCard } from './components/TopicCard';
import { TopicDetail } from './components/TopicDetail';
import { TopicRanking } from './components/TopicRanking';
import { TopicTrendBar } from './components/TopicTrendBar';
import { WatcherView } from './components/WatcherView';
import { useMonitorSnapshot } from './hooks/useMonitor';

import type { MonitorLocale } from './hooks/useMonitor';
import type { TopicCategory } from './topicConfig';

type MonitorTab = 'topics' | 'keywords' | 'social' | 'watcher' | 'details';

function MonitorPage() {
  const authLocale = useAuthStore((s) => s.locale);
  const [locale, setLocale] = useState<MonitorLocale>(authLocale === 'de-AT' ? 'at' : 'de');
  const [tab, setTab] = useState<MonitorTab>('topics');
  const [selectedTopic, setSelectedTopic] = useState<TopicCategory | null>(null);
  const { data: snapshot, isLoading, error } = useMonitorSnapshot(locale);

  const maxScore = snapshot ? Math.max(...snapshot.topics.map((t) => t.score), 1) : 1;

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

              <Tabs value={tab} onValueChange={(v) => setTab(v as MonitorTab)}>
                <TabsList>
                  <TabsTrigger value="topics">Themen</TabsTrigger>
                  <TabsTrigger value="keywords">Keywords</TabsTrigger>
                  <TabsTrigger value="social">X/Twitter</TabsTrigger>
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

            {isLoading && <LoadingSection />}

            {tab === 'watcher' && <WatcherView locale={locale} />}

            {snapshot && (
              <>
                {tab === 'topics' && (
                  <TopicRanking
                    topics={snapshot.topics}
                    totalArticles={snapshot.totalArticles}
                    sourcesCount={snapshot.sources.length}
                    onClick={setSelectedTopic}
                  />
                )}

                {tab === 'keywords' && snapshot.keywords && (
                  <>
                    <KeywordInsightsCard locale={locale} />
                    <KeywordRanking
                      keywords={snapshot.keywords}
                      totalArticles={snapshot.totalArticles}
                      sourcesCount={snapshot.sources.length}
                    />
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
