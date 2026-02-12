import React, { useState } from 'react';
import { FaUsers, FaChevronDown, FaChevronUp, FaFolder } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';

import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';

import type { IconType } from 'react-icons';

interface MenuItem {
  key: string;
  label: string;
  path: string;
  betaFeature?: string;
  icon: IconType;
  hasSubmenu?: boolean;
}

interface Group {
  id: string;
  name: string;
}

interface ProfileMenuProps {
  onNavigate?: () => void;
  variant?: 'dropdown' | 'sidebar';
  className?: string;
  groups?: Group[];
}

const PROFILE_MENU_ITEMS: MenuItem[] = [
  {
    key: 'gruppen',
    label: 'Gruppen',
    path: '/profile/gruppen',
    betaFeature: 'groups',
    icon: FaUsers,
    hasSubmenu: true,
  },
  { key: 'inhalte', label: 'Dateien', path: '/profile/inhalte', icon: FaFolder },
];

const ProfileMenu = ({
  onNavigate,
  variant = 'dropdown',
  className = '',
  groups = [],
}: ProfileMenuProps): React.ReactElement => {
  const location = useLocation();
  const { shouldShowTab } = useBetaFeatures();
  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(null);

  const filteredItems = PROFILE_MENU_ITEMS.filter((item) => {
    if (item.betaFeature) {
      return shouldShowTab(item.betaFeature);
    }
    return true;
  });

  const isActive = (path: string): boolean => {
    if (path === '/profile') {
      return location.pathname === '/profile';
    }
    return location.pathname.startsWith(path);
  };

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  const toggleSubmenu = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSubmenu(expandedSubmenu === key ? null : key);
  };

  return (
    <div className={`profile-menu profile-menu--${variant} ${className}`}>
      {filteredItems.map((item) => {
        const hasGroups =
          item.key === 'gruppen' && item.hasSubmenu && variant === 'dropdown' && groups.length > 0;
        const isExpanded = expandedSubmenu === item.key;

        if (hasGroups) {
          return (
            <div key={item.key} className="profile-menu-item-with-submenu">
              <button
                className={`profile-menu-item profile-menu-item-expandable ${isActive(item.path) ? 'profile-menu-item--active' : ''}`}
                onClick={(e: React.MouseEvent) => toggleSubmenu(item.key, e)}
                aria-expanded={isExpanded}
              >
                {item.icon && <item.icon className="profile-menu-icon" />}
                {item.label}
                <span className="profile-menu-chevron">
                  {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                </span>
              </button>
              {isExpanded && (
                <div className="profile-menu-submenu">
                  <Link to={item.path} className="profile-menu-submenu-item" onClick={handleClick}>
                    Übersicht
                  </Link>
                  {groups.map((group) => (
                    <Link
                      key={group.id}
                      to={`/profile/gruppen?group=${group.id}`}
                      className="profile-menu-submenu-item"
                      onClick={handleClick}
                    >
                      {group.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.key}
            to={item.path}
            className={`profile-menu-item ${isActive(item.path) ? 'profile-menu-item--active' : ''}`}
            onClick={handleClick}
          >
            {variant === 'dropdown' && item.icon && <item.icon className="profile-menu-icon" />}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
};

export { PROFILE_MENU_ITEMS };
export default ProfileMenu;
