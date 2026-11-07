import { Navigate, useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { TopicDetail } from '../components/TopicDetail';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { TOPIC_CONFIG, type TopicCategory } from '../topicConfig';

/**
 * /themen/:topic — alle Artikel eines Themas der letzten 24 Stunden. Die
 * Übersicht dazu ist die Themen-Karte auf /briefing; /themen selbst leitet
 * dorthin weiter.
 */
function MonitorTopicPage() {
  const { topic } = useParams<{ topic: string }>();
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const overview = withLocale('/briefing?karte=themen');

  if (!topic || !(topic in TOPIC_CONFIG)) return <Navigate to={overview} replace />;

  return (
    <PageContainer maxWidth="lg">
      <TopicDetail
        topic={topic as TopicCategory}
        locale={locale}
        onBack={() => navigate(overview)}
      />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorTopicPage, { title: 'Themen' });
