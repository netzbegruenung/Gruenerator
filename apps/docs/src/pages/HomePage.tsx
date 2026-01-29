import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { DocumentList } from '../components/document/DocumentList';
import './HomePage.css';

export const HomePage = () => {
  const { user } = useAuth();
  const { logout } = useAuthStore();

  return (
    <div className="home-page">
      <div className="home-page-container">
        <header className="home-page-header">
          <h1 className="home-page-title">Grünerator Docs</h1>

          <div className="home-page-user-section">
            <span className="home-page-user-name">{user?.display_name || user?.email}</span>
            <button onClick={() => logout()} className="home-page-logout-button">
              Abmelden
            </button>
          </div>
        </header>

        <main>
          <DocumentList />
        </main>
      </div>
    </div>
  );
};
