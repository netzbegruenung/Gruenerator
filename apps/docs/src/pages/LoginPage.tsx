import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from '../hooks/useAuth';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();
  const { isAuthenticated } = useAuth();

  const redirectTo = searchParams.get('redirectTo') || '/';

  // If already authenticated, redirect to target page
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, redirectTo, navigate]);

  const handleLogin = () => {
    login(redirectTo);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--background-color)',
      padding: '2rem',
    }}>
      <div style={{
        backgroundColor: 'var(--card-background)',
        padding: '3rem',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '2rem',
          marginBottom: '1rem',
          color: 'var(--font-color)',
        }}>
          Grünerator Docs
        </h1>

        <p style={{
          color: 'var(--font-color-secondary)',
          marginBottom: '2rem',
        }}>
          Melde dich an, um fortzufahren
        </p>

        <button
          onClick={handleLogin}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'white',
            backgroundColor: 'var(--primary-600)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-700)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-600)';
          }}
        >
          Anmelden
        </button>
      </div>
    </div>
  );
};
