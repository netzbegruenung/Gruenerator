import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaFolder, FaUsers, FaCogs, FaChevronDown, FaChevronUp, FaClipboardList, FaLayerGroup } from 'react-icons/fa';
import { SiCanva } from 'react-icons/si';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';

const PROFILE_MENU_ITEMS = [
  { key: 'gruppen', label: 'Gruppen', path: '/profile/gruppen', betaFeature: 'groups', icon: FaUsers, hasSubmenu: true },
  { key: 'custom_generators', label: 'Meine Grüneratoren', path: '/profile/grueneratoren', icon: FaCogs, hasSubmenu: true },
  { key: 'inhalte', label: 'Dateien und Inhalte', path: '/profile/inhalte', icon: FaFolder },
  { key: 'vorlagen', label: 'Meine Vorlagen', path: '/profile/inhalte/vorlagen', icon: FaLayerGroup },
  { key: 'anweisungen', label: 'Anweisungen', path: '/profile/inhalte/anweisungen', icon: FaClipboardList },
  { key: 'canva', label: 'Canva', path: '/profile/inhalte/canva', betaFeature: 'canva', icon: SiCanva }
];

const ProfileMenu = ({
  onNavigate,
  variant = 'dropdown',
  className = '',
  customGenerators = [],
  groups = []
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
        const hasGenerators = item.key === 'custom_generators' && item.hasSubmenu && variant === 'dropdown' && customGenerators.length > 0;
        const hasGroups = item.key === 'gruppen' && item.hasSubmenu && variant === 'dropdown' && groups.length > 0;
        const isExpanded = expandedSubmenu === item.key;

        if (hasGenerators || hasGroups) {
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
                  {hasGenerators && (
                    <>
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
                    </>
                  )}
                  {hasGroups && (
                    <>
                      <Link
                        to={item.path}
                        className="profile-menu-submenu-item"
                        onClick={handleClick}
                      >
                        Übersicht
                      </Link>
                      {groups.map(group => (
                        <Link
                          key={group.id}
                          to={`/profile/gruppen?group=${group.id}`}
                          className="profile-menu-submenu-item"
                          onClick={handleClick}
                        >
                          {group.name}
                        </Link>
                      ))}
                    </>
                  )}
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
