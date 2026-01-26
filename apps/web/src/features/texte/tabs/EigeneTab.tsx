import React, { useState, useCallback, lazy, Suspense, memo, useMemo } from 'react';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import Icon from '../../../components/common/Icon';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useCustomGeneratorsData, useSavedGenerators } from '../../auth/hooks/useProfileData';
import './EigeneTab.css';

const CreateCustomGeneratorPage = lazy(() => import('../../generators/CreateCustomGeneratorPage'));
// TEMPORARILY HIDDEN - Prompts tab
// const PromptsTab = lazy(() => import('../../prompts/PromptsTab'));

type SubTabType = 'generators'; // | 'prompts' - TEMPORARILY HIDDEN

interface EigeneTabProps {
  isActive: boolean;
}

interface GeneratorListItem {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  description?: string;
  owner_first_name?: string;
  owner_last_name?: string;
}

interface LoginPromptProps {
  onLogin: () => void;
}

const EigeneIcon = memo(() => <Icon category="navigation" name="eigene" size={48} />);
EigeneIcon.displayName = 'EigeneIcon';

const LoginPrompt: React.FC<LoginPromptProps> = memo(({ onLogin }) => (
  <div className="eigene-login-prompt">
    <EigeneIcon />
    <h2>Eigene Grüneratoren</h2>
    <p>Melde dich an, um deine eigenen Grüneratoren und Prompts zu erstellen.</p>
    <button onClick={onLogin} className="btn-primary">
      Anmelden
    </button>
  </div>
));

LoginPrompt.displayName = 'LoginPrompt';

const LoadingSpinner = memo(() => (
  <div className="eigene-loading">
    <div className="loading-spinner" />
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

const EigeneTab: React.FC<EigeneTabProps> = memo(({ isActive }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('generators');
  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const { query: generatorsQuery } = useCustomGeneratorsData({
    isActive,
    enabled: isAuthenticated,
  } as any);
  const { query: savedQuery } = useSavedGenerators({ isActive, enabled: isAuthenticated } as any);

  const generators = useMemo(
    () => (generatorsQuery.data || []) as GeneratorListItem[],
    [generatorsQuery.data]
  );

  const savedGenerators = useMemo(
    () => (savedQuery.data || []) as GeneratorListItem[],
    [savedQuery.data]
  );

  const isLoading = authLoading || generatorsQuery.isLoading || savedQuery.isLoading;

  const handleSelectGenerator = useCallback((generator: GeneratorListItem) => {
    window.open(`/gruenerator/${generator.slug}`, '_blank');
  }, []);

  const handleCreateCompleted = useCallback(() => {
    generatorsQuery.refetch();
  }, [generatorsQuery]);

  const handleLogin = useCallback(() => {
    window.location.href = '/login';
  }, []);

  // TEMPORARILY HIDDEN - Prompts tab switch
  // const switchToPrompts = useCallback(() => setActiveSubTab('prompts'), []);
  const switchToGenerators = useCallback(() => setActiveSubTab('generators'), []);

  if (authLoading || isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginPrompt onLogin={handleLogin} />;
  }

  return (
    <div className="eigene-container">
      <EarlyAccessBanner />

      {/* TEMPORARILY HIDDEN - Subtabs UI (only one tab now)
      <div className="eigene-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'prompts'}
          className={`eigene-subtab ${activeSubTab === 'prompts' ? 'active' : ''}`}
          onClick={switchToPrompts}
        >
          Prompts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === 'generators'}
          className={`eigene-subtab ${activeSubTab === 'generators' ? 'active' : ''}`}
          onClick={switchToGenerators}
        >
          Grüneratoren
        </button>
      </div>
      */}

      <Suspense fallback={<LoadingSpinner />}>
        {/* TEMPORARILY HIDDEN - Prompts tab content
        {activeSubTab === 'prompts' ? (
          <PromptsTab isActive={isActive && activeSubTab === 'prompts'} />
        ) : ( */}
        <CreateCustomGeneratorPage
          onCompleted={handleCreateCompleted}
          generators={generators}
          savedGenerators={savedGenerators}
          onSelectGenerator={handleSelectGenerator}
        />
        {/* )} */}
      </Suspense>
    </div>
  );
});

EigeneTab.displayName = 'EigeneTab';

export default EigeneTab;
