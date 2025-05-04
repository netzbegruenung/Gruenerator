import React from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Spinner from '../../../components/common/Spinner';
import LogoutButton from './LogoutButton';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

/**
 * Komponente zur Anzeige des Auth-Status im Header mit Login/Logout-Optionen
 * 
 * @param {Object} props - Komponenten-Props
 * @param {string} [props.className=''] - Zusätzliche CSS-Klassen
 * @returns {JSX.Element} AuthStatus-Komponente
 */
const AuthStatus = ({ className = '' }) => {
  const { user, loading } = useSupabaseAuth();

  // Container-Stil für die Komponente
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-small)'
  };

  if (loading) {
    return (
      <div style={containerStyle} className={className}>
        <Spinner size="small" />
      </div>
    );
  }

  if (user) {
    // Benutzer ist eingeloggt - zeige E-Mail und Logout-Button
    const userEmail = user.email || '';
    const displayEmail = userEmail.length > 20 
      ? `${userEmail.substring(0, 17)}...` 
      : userEmail;

    return (
      <div style={containerStyle} className={className}>
        <span style={{ 
          fontSize: '0.9rem', 
          color: 'var(--font-color)',
          marginRight: 'var(--spacing-xxsmall)'
        }}>
          {displayEmail}
        </span>
        <LogoutButton />
      </div>
    );
  }

  // Benutzer ist nicht eingeloggt - zeige Login/Registrieren-Links
  return (
    <div style={containerStyle} className={className}>
      <Link 
        to="/login" 
        style={{
          textDecoration: 'none',
          color: 'var(--font-color)',
          fontSize: '0.9rem',
          padding: 'var(--spacing-xxsmall) var(--spacing-xsmall)',
          borderRadius: '4px',
          transition: 'background-color 0.2s'
        }}
        className="auth-nav-link"
      >
        Anmelden
      </Link>
      <Link 
        to="/register" 
        style={{
          textDecoration: 'none',
          backgroundColor: 'var(--tanne)',
          color: 'white',
          fontSize: '0.9rem',
          padding: 'var(--spacing-xxsmall) var(--spacing-xsmall)',
          borderRadius: '4px',
          transition: 'background-color 0.2s'
        }}
        className="auth-nav-button"
      >
        Registrieren
      </Link>
    </div>
  );
};

AuthStatus.propTypes = {
  className: PropTypes.string
};

export default AuthStatus; 