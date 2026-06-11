import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth, useSitesBasePath } from '../SitesContext';

export function HomePage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const basePath = useSitesBasePath();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void navigate(`${basePath}/edit`);
    }
  }, [isAuthenticated, isLoading, navigate, basePath]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-neutral-600 dark:from-grey-900 dark:to-grey-950 p-[var(--spacing-responsive-large)]">
        <div className="text-center p-[var(--spacing-responsive-large)] max-w-[600px] md:p-[var(--spacing-responsive-xlarge)]">
          <div className="w-10 h-10 border-[3px] border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-[length:var(--font-size-lg)] text-grey-600 dark:text-grey-400 mb-xl">
            Wird geladen...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-neutral-600 dark:from-grey-900 dark:to-grey-950 p-[var(--spacing-responsive-large)]">
      <div className="text-center p-[var(--spacing-responsive-large)] max-w-[600px] md:p-[var(--spacing-responsive-xlarge)]">
        <h1 className="text-[length:var(--font-size-2xl)] text-primary-600 dark:text-primary-400 mb-md md:text-[length:var(--font-size-3xl)]">
          Grünerator Sites
        </h1>
        <p className="text-[length:var(--font-size-lg)] text-grey-600 dark:text-grey-400 mb-xl">
          Erstelle deine persönliche Kandidat*innen-Seite
        </p>
        <button
          className="bg-primary-600 text-white border-none py-md px-xl text-[length:var(--font-size-lg)] font-semibold rounded-sm cursor-pointer transition-colors min-h-12 hover:bg-primary-700"
          onClick={() => login(`${basePath}/edit`)}
        >
          Anmelden
        </button>
      </div>
    </div>
  );
}
