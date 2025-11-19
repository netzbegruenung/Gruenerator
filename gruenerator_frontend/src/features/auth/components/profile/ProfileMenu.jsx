import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaUser, FaFolderOpen, FaUsers, FaCogs, FaFlask, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';

const PROFILE_MENU_ITEMS = [
  { key: 'profile', label: 'Profil', path: '/profile', icon: FaUser },
  { key: 'inhalte', label: 'Inhalte & Integrationen', path: '/profile/inhalte', icon: FaFolderOpen },
  { key: 'gruppen', label: 'Gruppen', path: '/profile/gruppen', betaFeature: 'groups', icon: FaUsers },
  { key: 'custom_generators', label: 'Meine Grüneratoren', path: '/profile/generatoren', icon: FaCogs, hasSubmenu: true },
  { key: 'labor', label: 'Labor', path: '/profile/labor', betaFeature: 'labor', icon: FaFlask }
];

const ProfileMenu = ({
  onNavigate,
  variant = 'dropdown',
  className = '',
  customGenerators = []
}) => {
  const location = useLocation();
  const { shouldShowTab } = useBetaFeatures();
  const [expandedSubmenu, setExpandedSubmenu] = useState(null);

  const filteredItems = PROFILE_MENU_ITEMS.filter(item => {
    if (item.betaFeature) {
      return shouldShowTab(item.betaFeature);
    }
    return true;
  });

  const isActive = (path) => {
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

  const toggleSubmenu = (key, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSubmenu(expandedSubmenu === key ? null : key);
  };

  return (
    <div className={`profile-menu profile-menu--${variant} ${className}`}>
      {filteredItems.map(item => {
        const hasGenerators = item.hasSubmenu && variant === 'dropdown' && customGenerators.length > 0;
        const isExpanded = expandedSubmenu === item.key;

        if (hasGenerators) {
          return (
            <div key={item.key} className="profile-menu-item-with-submenu">
              <button
                className={`profile-menu-item profile-menu-item-expandable ${isActive(item.path) ? 'profile-menu-item--active' : ''}`}
                onClick={(e) => toggleSubmenu(item.key, e)}
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
                  <Link
                    to={item.path}
                    className="profile-menu-submenu-item"
                    onClick={handleClick}
                  >
                    Übersicht
                  </Link>
                  {customGenerators.map(generator => (
                    <Link
                      key={generator.id}
                      to={`/gruenerator/${generator.slug}`}
                      className="profile-menu-submenu-item"
                      onClick={handleClick}
                    >
                      {generator.name}
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
