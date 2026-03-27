import { SectionHeader } from '@gruenerator/ui';
import { useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ToolGrid from '../../components/common/ToolGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getIcon } from '../../config/icons';
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

import type { ToolEntry } from '../../components/common/ToolGrid';

const BOTTOM_TOOLS: ToolEntry[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Sharepic-Vorlagen erstellen und bearbeiten.',
    path: '/datenbank/vorlagen',
    icon: getIcon('navigation', 'vorlagen'),
    tags: ['Sharepics', 'Design'],
  },
  {
    id: 'recherche',
    title: 'Recherche',
    description: 'Websuche und Quellenrecherche mit KI-Unterstützung.',
    path: '/recherche',
    icon: getIcon('navigation', 'suche'),
    tags: ['Suche', 'Quellen'],
  },
];

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

        <GroupsSection />
        <NotebooksSection />

        <section className="mb-xl">
          <SectionHeader title="Weitere Tools" />
          <ToolGrid tools={BOTTOM_TOOLS} columns={2} />
        </section>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(WorkplacePage, {
  title: 'Desk',
});
