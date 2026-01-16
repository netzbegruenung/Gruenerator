import React, { useCallback, lazy, Suspense, memo, useMemo } from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useCustomGeneratorsData, useSavedGenerators } from '../../auth/hooks/useProfileData';
import Icon from '../../../components/common/Icon';
import './EigeneTab.css';

const CreateCustomGeneratorPage = lazy(() => import('../../generators/CreateCustomGeneratorPage'));

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

// Memoized icon component
const EigeneIcon = memo(() => <Icon category="navigation" name="eigene" size={48} />);
EigeneIcon.displayName = 'EigeneIcon';

// Memoized LoginPrompt component
const LoginPrompt: React.FC<LoginPromptProps> = memo(({ onLogin }) => (
  <div className="eigene-login-prompt">
    <EigeneIcon />
    <h2>Eigene Grüneratoren</h2>
    <p>Melde dich an, um deine eigenen Grüneratoren zu erstellen und zu nutzen.</p>
    <button onClick={onLogin} className="btn-primary">
      Anmelden
    </button>
  </div>
));

LoginPrompt.displayName = 'LoginPrompt';

// Loading fallback component
const LoadingSpinner = memo(() => (
  <div className="eigene-loading">
    <div className="loading-spinner" />
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

const EigeneTab: React.FC<EigeneTabProps> = memo(({ isActive }) => {
  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const { query: generatorsQuery } = useCustomGeneratorsData({ isActive, enabled: isAuthenticated } as any);
  const { query: savedQuery } = useSavedGenerators({ isActive, enabled: isAuthenticated } as any);

  const generators = useMemo(() =>
    (generatorsQuery.data || []) as GeneratorListItem[],
    [generatorsQuery.data]
  );

  const savedGenerators = useMemo(() =>
    (savedQuery.data || []) as GeneratorListItem[],
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

  if (!isActive) return null;

  if (authLoading || isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginPrompt onLogin={handleLogin} />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CreateCustomGeneratorPage
        onCompleted={handleCreateCompleted}
        generators={generators}
        savedGenerators={savedGenerators}
        onSelectGenerator={handleSelectGenerator}
      />
    </Suspense>
  );
});

EigeneTab.displayName = 'EigeneTab';

export default EigeneTab;
