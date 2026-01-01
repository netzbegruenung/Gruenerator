import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function HomePage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/edit');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="home-page">
        <div className="home-container">
          <div className="loading-spinner" />
          <p>Wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <h1>Grünerator Sites</h1>
        <p>Erstelle deine persönliche Kandidat*innen-Seite</p>
        <button className="login-button" onClick={() => login('/edit')}>
          Anmelden
        </button>
      </div>
    </div>
  );
}
