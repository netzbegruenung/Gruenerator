import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { DocumentList } from '../components/document/DocumentList';

export const HomePage = () => {
  const { user } = useAuth();
  const { logout } = useAuthStore();

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <h1 style={{
            fontSize: '1.5rem',
            color: 'var(--font-color)',
          }}>
            Grünerator Docs
          </h1>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--font-color-secondary)' }}>
              {user?.display_name || user?.email}
            </span>
            <button
              onClick={() => logout()}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                color: 'var(--font-color)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
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
