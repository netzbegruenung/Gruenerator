import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaUserCircle, FaUser, FaSignOutAlt, FaCog } from 'react-icons/fa';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const ProfileButton = () => {
  const { user, loading, logout } = useSupabaseAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Nur den Namen abrufen, wenn der Benutzer eingeloggt ist
    const fetchUserProfile = async () => {
      if (user) {
        try {
          const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
          const { data, error } = await templatesSupabase
            .from('profiles')
            .select('display_name, first_name')
            .eq('id', user.id)
            .single();
          
          if (error) throw error;
          
          if (data) {
            setDisplayName(data.display_name || '');
            setFirstName(data.first_name || '');
          }
        } catch (err) {
          console.error('Fehler beim Laden des Profils:', err.message);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  // Dropdown schließen wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  // Initialen für Avatar erstellen
  const getInitials = () => {
    if (firstName) {
      return firstName.charAt(0).toUpperCase();
    }
    if (user && user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "?";
  };
  
  // Korrekte Genitiv-Form mit Apostroph
  const getPossessiveForm = (name) => {
    if (!name) return "Dein";
    
    // Endet der Name auf s, ss, ß, z, tz, x oder ce, nur Apostroph anhängen
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      // Sonst 's anhängen
      return `${name}'s`;
    }
  };

  if (loading) {
    return (
      <div className="profile-button-container">
        <div className="profile-button-loading"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Link to="/login" className="login-button">
        <FaUserCircle className="profile-icon" />
        <span>Login</span>
      </Link>
    );
  }

  return (
    <div className="profile-button-container" ref={dropdownRef}>
      <button 
        className="profile-button header-nav-item profile-label-button" 
        onClick={toggleDropdown}
        aria-expanded={dropdownOpen}
        aria-label="Profil-Menü öffnen"
      >
        <FaUserCircle className="profile-icon" />
      </button>
      
      {dropdownOpen && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <div className="profile-avatar-wrapper">
              <div className="profile-dropdown-avatar">
                {getInitials()}
              </div>
            </div>
            <div className="profile-dropdown-greeting">
              {firstName ? getPossessiveForm(firstName) : "Dein"} Grünerator
            </div>
            <div className="profile-dropdown-email">
              {user.email}
            </div>
          </div>
          <div className="profile-dropdown-links">
            <Link 
              to="/profile"
              className="profile-dropdown-link"
              onClick={() => setDropdownOpen(false)}
            >
              <FaUser className="profile-dropdown-icon" />
              <span>Mein Profil</span>
            </Link>
            <button 
              className="profile-dropdown-link logout-link"
              onClick={() => {
                logout();
                setDropdownOpen(false);
              }}
            >
              <FaSignOutAlt className="profile-dropdown-icon" />
              <span>Abmelden</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileButton; 