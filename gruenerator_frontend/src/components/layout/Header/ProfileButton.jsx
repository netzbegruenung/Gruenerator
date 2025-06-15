import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaUserCircle, FaUser, FaSignOutAlt, FaCog } from 'react-icons/fa';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { getAvatarDisplayProps, useProfileData } from '../../../features/auth/utils/profileUtils';
import { templatesSupabase } from '../../../components/utils/templatesSupabaseClient';

const ProfileButton = () => {
  const { user, loading, logout, isLoggingOut, isProfileLoading, setLoginIntent } = useOptimizedAuth();
  // Profildaten aus Query holen
  const { data: profile } = useProfileData(user?.id, templatesSupabase);

  // Avatar und Name mit intelligent fallbacks für instant rendering
  const displayName = profile?.display_name || '';
  const firstName = profile?.first_name || '';
  // Use default avatar (robot #1) while loading for immediate visual feedback
  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  const dropdownRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    // Listen for avatar updates from other components
    const handleAvatarUpdate = (event) => {
      // This component doesn't manage avatar updates, so no action needed
    };
    
    window.addEventListener('avatarUpdated', handleAvatarUpdate);
    
    return () => {
      window.removeEventListener('avatarUpdated', handleAvatarUpdate);
    };
  }, []);

  // Dropdown schließen wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
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

  // Avatar-Eigenschaften für Header und Dropdown bestimmen
  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    first_name: firstName,
    last_name: '', // Wird im Header nicht verwendet
    email: user?.email
  });

  // Show login button for non-authenticated users only
  if (!loading && !user) {
    return (
      <Link to="/login" className="login-button" aria-label="Anmelden" onClick={() => setLoginIntent()}>
        <FaUserCircle className="profile-icon" />
      </Link>
    );
  }

  // Show cached/default avatar immediately for authenticated users
  // Profile data will update the avatar when available
  if (!user && loading) {
    return (
      <div className="profile-button-container">
        <button 
          className="profile-button header-nav-item profile-label-button" 
          disabled
          aria-label="Profil wird geladen"
        >
          <FaUserCircle className="profile-icon" />
        </button>
      </div>
    );
  }

  return (
    <div className="profile-button-container" ref={dropdownRef}>
      <button 
        className="profile-button header-nav-item profile-label-button" 
        onClick={toggleDropdown}
        aria-expanded={isDropdownOpen}
        aria-label="Profil-Menü öffnen"
      >
        {avatarProps.type === 'robot' ? (
          <div className="profile-header-avatar-robot">
            <img 
              src={avatarProps.src} 
              alt={avatarProps.alt}
              className="profile-header-robot-image"
              style={{ 
                opacity: isProfileLoading ? 0.8 : 1,
                transition: 'opacity 0.2s ease-in-out'
              }}
            />
          </div>
        ) : (
          <FaUserCircle 
            className="profile-icon" 
            style={{ 
              opacity: isProfileLoading ? 0.8 : 1,
              transition: 'opacity 0.2s ease-in-out'
            }}
          />
        )}
      </button>
      {isDropdownOpen && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <div className="profile-dropdown-avatar">
              {avatarProps.type === 'robot' ? (
                <div className="profile-dropdown-avatar-robot">
                  <img 
                    src={avatarProps.src} 
                    alt={avatarProps.alt}
                    className="profile-dropdown-robot-image"
                  />
                </div>
              ) : (
                <FaUserCircle className="profile-dropdown-avatar-icon" />
              )}
            </div>
            <div className="profile-dropdown-info">
              <div className="profile-dropdown-greeting">
                {firstName ? getPossessiveForm(firstName) : "Dein"} Grünerator
              </div>
              <div className="profile-dropdown-email">
                {user?.email || ''}
              </div>
            </div>
          </div>
          <div className="profile-dropdown-links">
            <Link 
              to="/profile"
              className="profile-dropdown-link"
              onClick={() => {}}
            >
              <FaUser className="profile-dropdown-icon" />
              <span>Mein Profil</span>
            </Link>
            <button 
              className="profile-dropdown-link logout-link"
              disabled={isLoggingOut}
              onClick={() => {
                if (!isLoggingOut) {
                  logout();
                }
              }}
            >
              <FaSignOutAlt className="profile-dropdown-icon" />
              <span>{isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileButton; 