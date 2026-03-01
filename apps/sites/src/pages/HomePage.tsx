import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export function HomePage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void navigate('/edit');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-neutral-600 p-[var(--spacing-lg-r)]">
        <div className="text-center p-[var(--spacing-lg-r)] max-w-[600px] md:p-[var(--spacing-xl-r)]">
          <div className="w-10 h-10 border-[3px] border-grey-200 border-t-primary-600 rounded-full animate-[spin_1s_linear_infinite]" />
          <p className="text-[length:var(--font-size-lg)] text-grey-600 mb-xl">Wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-neutral-600 p-[var(--spacing-lg-r)]">
      <div className="text-center p-[var(--spacing-lg-r)] max-w-[600px] md:p-[var(--spacing-xl-r)]">
        <h1 className="text-[length:var(--font-size-2xl)] text-primary-600 mb-md md:text-[length:var(--font-size-3xl)]">
          Grünerator Sites
        </h1>
        <p className="text-[length:var(--font-size-lg)] text-grey-600 mb-xl">
          Erstelle deine persönliche Kandidat*innen-Seite
        </p>
        <button
          className="bg-primary-600 text-white border-none py-md px-xl text-[length:var(--font-size-lg)] font-semibold rounded-sm cursor-pointer transition-colors min-h-12 hover:bg-primary-700"
          onClick={() => login('/edit')}
        >
          Anmelden
        </button>
      </div>
    </div>
  );
}
