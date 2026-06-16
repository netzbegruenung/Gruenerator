import { LoadingSection } from '@gruenerator/ui';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { KeywordInsightsCard } from '../components/KeywordInsightsCard';
import { KeywordRanking } from '../components/KeywordRanking';
import { MonitorShell } from '../components/MonitorShell';
import { SocialTrends } from '../components/SocialTrends';
import { TopicDetail } from '../components/TopicDetail';
import { TopicRanking } from '../components/TopicRanking';
import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_CONFIG } from '../topicConfig';

import type { TopicCategory } from '../topicConfig';

/** /experiments/monitor/themen and /experiments/monitor/themen/:topic — ranking with drill-in. */
function MonitorThemenPage() {
  const { topic } = useParams<{ topic?: string }>();
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data: snapshot, isLoading } = useMonitorSnapshot(locale);

  const topicKey: TopicCategory | null =
    topic !== undefined && topic in TOPIC_CONFIG ? (topic as TopicCategory) : null;

  if (topic !== undefined && topicKey === null) {
    return <Navigate to={withLocale('/experiments/monitor/themen')} replace />;
  }

  if (topicKey !== null) {
    return (
      <MonitorShell section="themen">
        <TopicDetail
          topic={topicKey}
          locale={locale}
          onBack={() => navigate(withLocale('/experiments/monitor/themen'))}
        />
      </MonitorShell>
    );
  }

  return (
    <MonitorShell section="themen">
      {isLoading && <LoadingSection />}
      {snapshot && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-lg items-start">
          <div>
            <TopicRanking
              topics={snapshot.topics}
              totalArticles={snapshot.totalArticles}
              sourcesCount={snapshot.sources.length}
              onClick={(t) => navigate(withLocale(`/experiments/monitor/themen/${t}`))}
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
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorThemenPage, { title: 'Monitor' });
