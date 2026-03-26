import { useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';
import useBetaFeatures from '../../hooks/useBetaFeatures';
import { useFirstName } from '../../hooks/useFirstName';
import { DEFAULT_MODE } from '../texte/modes';

import CreatorSection from './components/CreatorSection';
import GroupsSection from './components/GroupsSection';
import NotebooksSection from './components/NotebooksSection';
import RecentlyCreatedSection from './components/RecentlyCreatedSection';
import TextsSection from './components/TextsSection';
import ToolsSection from './components/ToolsSection';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Gute Nacht';
  if (hour < 12) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

const WorkplacePage = () => {
  useOptimizedAuth();
  const { canAccessBetaFeature } = useBetaFeatures();
  const firstName = useFirstName();

  const [mode, setMode] = useState(DEFAULT_MODE);

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg">
        <div className="text-center mb-lg pt-md">
          <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
            {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
          </h1>
          <p className="text-lg text-grey-500 dark:text-grey-400">
            Beschreibe dein Vorhaben und die KI erstellt es für dich.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mb-xl">
          <CreatorSection mode={mode} onModeChange={setMode} />
        </div>

        <ToolsSection canAccessBetaFeature={canAccessBetaFeature} />

        <RecentlyCreatedSection
          showDocs={canAccessBetaFeature('docs')}
          showBoards={canAccessBetaFeature('boards')}
        />

        <TextsSection />

        <div className="grid grid-cols-2 gap-xl max-md:grid-cols-1">
          <GroupsSection />
          <NotebooksSection />
        </div>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(WorkplacePage, {
  title: 'Desk',
});
