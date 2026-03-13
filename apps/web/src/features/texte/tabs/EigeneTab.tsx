import React, { useCallback, lazy, Suspense, memo, useMemo } from 'react';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import Icon from '../../../components/common/Icon';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useCustomGeneratorsData, useSavedGenerators } from '../../auth/hooks/useProfileData';

const CreateCustomGeneratorPage = lazy(() => import('../../generators/CreateCustomGeneratorPage'));

type EigeneTabProps = Record<string, never>;

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
  <div className="flex flex-col items-center justify-center text-center p-2xl min-h-[300px] gap-md text-foreground max-w-[600px] mx-auto bg-[var(--card-background)] border border-[var(--card-border)] rounded-md shadow-sm max-md:border-none max-md:shadow-none max-md:rounded-none max-[480px]:p-lg forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace]">
    <EigeneIcon />
    <h2 className="m-0 text-2xl font-semibold">Eigene Grüneratoren</h2>
    <p className="m-0 text-grey-500 max-w-[400px] leading-relaxed">
      Melde dich an, um deine eigenen Grüneratoren und Agenten zu erstellen.
    </p>
    <button onClick={onLogin} className="btn-primary">
      Anmelden
    </button>
  </div>
));

LoginPrompt.displayName = 'LoginPrompt';

const LoadingSpinner = memo(() => (
  <div className="flex justify-center items-center min-h-[400px] text-grey-500">
    <div className="loading-spinner" />
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

const EigeneTab: React.FC<EigeneTabProps> = memo(() => {
  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const { query: generatorsQuery } = useCustomGeneratorsData({
    isActive: true,
    enabled: isAuthenticated,
  });
  const { query: savedQuery } = useSavedGenerators({
    isActive: true,
  });

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
    void generatorsQuery.refetch();
  }, [generatorsQuery]);

  const handleGeneratorChanged = useCallback(() => {
    void generatorsQuery.refetch();
  }, [generatorsQuery]);

  const handleLogin = useCallback(() => {
    window.location.href = '/login';
  }, []);

  if (authLoading || isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginPrompt onLogin={handleLogin} />;
  }

  return (
    <div className="w-full text-center">
      <EarlyAccessBanner />

      <Suspense fallback={<LoadingSpinner />}>
        <CreateCustomGeneratorPage
          onCompleted={handleCreateCompleted}
          generators={generators}
          savedGenerators={savedGenerators}
          onSelectGenerator={handleSelectGenerator}
          onDeleteGenerator={handleGeneratorChanged}
          onGeneratorUpdated={handleGeneratorChanged}
        />
      </Suspense>
    </div>
  );
});

EigeneTab.displayName = 'EigeneTab';

export default EigeneTab;
