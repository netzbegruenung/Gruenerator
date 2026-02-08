import { DocumentList } from '@gruenerator/docs';
import { logout, type DocsCapacitorUser } from '../auth/capacitorAuth';

interface HomePageProps {
  user: DocsCapacitorUser;
  onLogout: () => void;
}

export const HomePage = ({ user, onLogout }: HomePageProps) => {
  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="mobile-home">
      <header className="mobile-header">
        <h1 className="mobile-header-title">Grünerator Docs</h1>
        <div className="mobile-header-actions">
          <span className="mobile-user-name">{user.display_name || user.email}</span>
          <button onClick={handleLogout} className="mobile-logout-btn">
            Abmelden
          </button>
        </div>
      </header>
      <main className="mobile-main">
        <DocumentList />
      </main>
    </div>
  );
};
