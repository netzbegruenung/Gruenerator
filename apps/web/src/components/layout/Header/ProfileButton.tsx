import React, { useState, useRef, useEffect } from 'react';
import { FaUserCircle, FaSignOutAlt } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import ProfileMenu from '../../../features/auth/components/profile/ProfileMenu';
import { useProfile, useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import { useGroups } from '../../../features/groups/hooks/useGroups';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfileStore } from '../../../stores/profileStore';

interface Profile {
  display_name?: string;
  avatar_robot_id?: number;
}

const ProfileButton = () => {
  const { user, loading, logout, isLoggingOut, isInitialLoad, setLoginIntent } = useOptimizedAuth();

  // Profildaten aus Query holen - now uses backend API via useAuth
  const { data: profile } = useProfile(user?.id) as { data: Profile | undefined };

  // Fetch custom generators for authenticated users (for data sync)
  useCustomGeneratorsData({ enabled: !!user?.id });

  // Fetch user groups for authenticated users
  const { userGroups = [] } = useGroups({ isActive: !!user?.id });

  // Avatar und Name mit intelligent fallbacks für instant rendering
  const displayName = profile?.display_name || '';
  // Use default avatar (robot #1) while loading for immediate visual feedback
  const avatarRobotId = profile?.avatar_robot_id ?? 1;
  // isProfileLoading equivalent - true when initial load is happening
  const isProfileLoading = isInitialLoad;

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    // Listen for avatar updates from other components
    const handleAvatarUpdate = () => {
      // This component doesn't manage avatar updates, so no action needed
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdate);

    return () => {
      window.removeEventListener('avatarUpdated', handleAvatarUpdate);
    };
  }, []);

  // Dropdown schließen wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  // Korrekte Genitiv-Form mit Apostroph
  const getPossessiveForm = (name: string | undefined): string => {
    if (!name) return 'Dein';

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
    display_name: displayName,
    email: user?.email,
  });

  // Show login button for non-authenticated users only
  if (!loading && !user) {
    return (
      <Link
        to="/login"
        className="login-button"
        aria-label="Anmelden"
        onClick={() => setLoginIntent()}
      >
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
                transition: 'opacity 0.2s ease-in-out',
              }}
            />
          </div>
        ) : (
          <FaUserCircle
            className="profile-icon"
            style={{
              opacity: isProfileLoading ? 0.8 : 1,
              transition: 'opacity 0.2s ease-in-out',
            }}
          />
        )}
      </button>
      {isDropdownOpen && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <Link
              to="/profile"
              className="profile-dropdown-avatar"
              onClick={() => setIsDropdownOpen(false)}
            >
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
            </Link>
            <div className="profile-dropdown-info">
              <div className="profile-dropdown-greeting">
                {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
              </div>
              <div className="profile-dropdown-email">{user?.email || ''}</div>
            </div>
          </div>
          <div className="profile-dropdown-links">
            <ProfileMenu
              variant="dropdown"
              onNavigate={() => setIsDropdownOpen(false)}
              groups={userGroups}
            />
            <div className="profile-dropdown-divider" />
            <div className="profile-dropdown-footer">
              <Link
                to="/profile"
                className="profile-dropdown-link"
                onClick={() => setIsDropdownOpen(false)}
              >
                <HiCog className="profile-dropdown-icon" />
                <span>Einstellungen</span>
              </Link>
              <button
                className="profile-dropdown-icon-button logout-icon-button"
                disabled={isLoggingOut}
                onClick={() => {
                  if (!isLoggingOut) {
                    void logout();
                  }
                }}
                aria-label={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
                title={isLoggingOut ? 'Wird abgemeldet...' : 'Abmelden'}
              >
                <FaSignOutAlt />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileButton;
