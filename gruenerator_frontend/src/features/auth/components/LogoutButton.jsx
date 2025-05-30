import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

/**
 * Button zum Abmelden des Benutzers
 * 
 * @param {Object} props - Komponenten-Props
 * @param {string} [props.className=''] - Zusätzliche CSS-Klassen für den Button
 * @param {string} [props.label='Abmelden'] - Text, der im Button angezeigt wird
 * @param {function} [props.onLogoutSuccess] - Callback, der nach erfolgreicher Abmeldung aufgerufen wird
 * @returns {JSX.Element} LogoutButton-Komponente
 */
const LogoutButton = ({ className = '', label = 'Abmelden', onLogoutSuccess }) => {
  const { logout } = useSupabaseAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      if (onLogoutSuccess) {
        onLogoutSuccess();
      } else {
        // Zur "Ausgeloggt"-Seite navigieren
        navigate('/logged-out');
      }
    } catch (error) {
      console.error('Logout fehlgeschlagen:', error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <button
      type="button"
      className={`logout-button ${className}`}
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? <Spinner size="small" /> : label}
    </button>
  );
};

LogoutButton.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string,
  onLogoutSuccess: PropTypes.func
};

export default LogoutButton; 