import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Spinner from '../../../components/common/Spinner';

/**
 * Komponente für Social-Login-Buttons (OAuth-Provider)
 * 
 * @param {Object} props - Komponenten-Props
 * @param {string} [props.className=''] - Zusätzliche CSS-Klassen
 * @param {string} [props.redirectTo=''] - URL, zu der nach erfolgreicher Anmeldung weitergeleitet werden soll
 * @returns {JSX.Element} SocialLoginButtons-Komponente
 */
const SocialLoginButtons = ({ className = '', redirectTo = '' }) => {
  const [loadingProvider, setLoadingProvider] = useState(null);
  
  const handleSocialLogin = async (provider) => {
    setLoadingProvider(provider);
    
    try {
      // Dynamischer Import für den Supabase Client
      const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
      
      const options = {
        provider,
        options: {}
      };
      
      // Falls ein Redirect-Pfad angegeben wurde, diesen verwenden
      if (redirectTo) {
        options.options.redirectTo = redirectTo;
      }
      
      // Verwende den Templates-Client
      await templatesSupabase.auth.signInWithOAuth(options);
      
      // Hinweis: Die tatsächliche Weiterleitung erfolgt automatisch durch Supabase
    } catch (error) {
      console.error('Error during social login:', error);
    } finally {
      setLoadingProvider(null);
    }
  };
  
  // Styling für Social-Buttons
  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacing-small)',
    width: '100%',
    padding: 'var(--spacing-small)',
    marginBottom: 'var(--spacing-small)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '4px',
    backgroundColor: 'var(--background-color)',
    color: 'var(--font-color)',
    fontWeight: 'normal',
    cursor: 'pointer',
    transition: 'background-color 0.2s, transform 0.1s',
  };
  
  // Icons für die verschiedenen Provider als SVG
  const providerIcons = {
    google: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
        <path 
          fill="#4285F4" 
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
        />
        <path 
          fill="#34A853" 
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
        />
        <path 
          fill="#FBBC05" 
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" 
        />
        <path 
          fill="#EA4335" 
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" 
        />
      </svg>
    ),
    github: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 1.27a11 11 0 00-3.48 21.46c.55.09.73-.24.73-.53v-1.85c-3.03.65-3.67-1.46-3.67-1.46-.5-1.26-1.21-1.6-1.21-1.6-.99-.67.07-.66.07-.66 1.09.08 1.67 1.12 1.67 1.12.97 1.66 2.54 1.19 3.16.9.1-.7.38-1.18.69-1.45-2.42-.27-4.96-1.2-4.96-5.36 0-1.18.42-2.15 1.12-2.91-.11-.28-.49-1.4.11-2.91 0 0 .93-.3 3.03 1.13a10.5 10.5 0 015.6 0c2.11-1.43 3.03-1.13 3.03-1.13.6 1.51.22 2.63.1 2.91.7.76 1.12 1.73 1.12 2.91 0 4.17-2.54 5.08-4.96 5.35.39.33.73.99.73 1.99v2.95c0 .29.19.63.74.53A11 11 0 0012 1.27"
        />
      </svg>
    ),
    apple: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.23 2.32-.94 3.69-.8 1.56.16 2.75.81 3.54 2.06-3.21 1.87-2.23 6.32 1.43 7.64-.73 1.83-1.67 3.63-3.74 4.27zm-3.92-18c.16 1.94-1.42 3.59-3.67 3.33-.27-2.29 1.42-3.82 3.67-3.33z"
        />
      </svg>
    ),
    microsoft: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 23 23">
        <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
        <path fill="#f35325" d="M1 1h10v10H1z"/>
        <path fill="#81bc06" d="M12 1h10v10H12z"/>
        <path fill="#05a6f0" d="M1 12h10v10H1z"/>
        <path fill="#ffba08" d="M12 12h10v10H12z"/>
      </svg>
    )
  };
  
  return (
    <div className={`social-login-buttons ${className}`}>
      <div className="social-buttons-divider" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        margin: 'var(--spacing-medium) 0' 
      }}>
        <div style={{ flexGrow: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
        <span style={{ 
          margin: '0 var(--spacing-small)', 
          color: 'var(--font-color)', 
          fontSize: '0.9rem',
          opacity: 0.8
        }}>
          oder anmelden mit
        </span>
        <div style={{ flexGrow: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }}></div>
      </div>
      
      <button
        type="button"
        onClick={() => handleSocialLogin('google')}
        style={buttonStyle}
        disabled={loadingProvider !== null}
        className="social-login-button google-button"
      >
        {loadingProvider === 'google' ? <Spinner size="small" /> : providerIcons.google}
        Mit Google anmelden
      </button>
      
      <button
        type="button"
        onClick={() => handleSocialLogin('github')}
        style={buttonStyle}
        disabled={loadingProvider !== null}
        className="social-login-button github-button"
      >
        {loadingProvider === 'github' ? <Spinner size="small" /> : providerIcons.github}
        Mit GitHub anmelden
      </button>
      
      <button
        type="button"
        onClick={() => handleSocialLogin('microsoft')}
        style={buttonStyle}
        disabled={loadingProvider !== null}
        className="social-login-button microsoft-button"
      >
        {loadingProvider === 'microsoft' ? <Spinner size="small" /> : providerIcons.microsoft}
        Mit Microsoft anmelden
      </button>
      
      <button
        type="button"
        onClick={() => handleSocialLogin('apple')}
        style={buttonStyle}
        disabled={loadingProvider !== null}
        className="social-login-button apple-button"
      >
        {loadingProvider === 'apple' ? <Spinner size="small" /> : providerIcons.apple}
        Mit Apple anmelden
      </button>
    </div>
  );
};

SocialLoginButtons.propTypes = {
  className: PropTypes.string,
  redirectTo: PropTypes.string
};

export default SocialLoginButtons; 