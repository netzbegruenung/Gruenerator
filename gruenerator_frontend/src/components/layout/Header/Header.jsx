//header.js
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PiCaretDown, PiSun, PiMoon } from 'react-icons/pi';
import NavMenu from './NavMenu';
import ProfileButton from './ProfileButton';
import ThemeToggleButton from './ThemeToggleButton';
import useDarkMode from '../../hooks/useDarkMode';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, MenuItem, menuStyles, handleMenuInteraction } from './menuData';

import { useLazyAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';

const Header = () => {
    useLazyAuth(); // Keep for other auth functionality
    const { getBetaFeatureState } = useBetaFeatures();
    const sharepicBetaEnabled = getBetaFeatureState('sharepic');
    const databaseBetaEnabled = getBetaFeatureState('database');
    const youBetaEnabled = getBetaFeatureState('you');
    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [darkMode, toggleDarkMode] = useDarkMode();
    const { announce } = useAccessibility();
    const headerRef = useRef(null);

    const menuItems = getMenuItems({ sharepicBetaEnabled, databaseBetaEnabled, youBetaEnabled });
    const directMenuItems = getDirectMenuItems({ sharepicBetaEnabled, databaseBetaEnabled, youBetaEnabled });

    // Removed deprecated setupKeyboardNav - browser handles keyboard navigation natively

    const toggleMenu = () => {
        setMenuActive(!menuActive);
        // Reduced announcements - screen readers handle menu state natively
    };

    const handleMouseEnter = (dropdown) => {
        setActiveDropdown(dropdown);
    };

    const handleMouseLeave = () => {
        setActiveDropdown(null);
    };

    const handleFocus = (dropdown) => {
        setActiveDropdown(dropdown);
    };

    const handleBlur = (event) => {
        // Use setTimeout to allow focus to move to dropdown items
        setTimeout(() => {
            const currentTarget = event.currentTarget;
            // Only close dropdown if focus has moved completely outside the dropdown container
            if (currentTarget && !currentTarget.contains(document.activeElement)) {
                setActiveDropdown(null);
            }
        }, 150);
    };

    const handleNavMenuClose = () => {
        setMenuActive(false);
    };

    const handleKeyDown = (event, dropdown) => {
        const { key } = event;
        
        // Handle Enter and Space to toggle dropdown
        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
            return;
        }
        
        // Handle Arrow Down to open dropdown (let browser handle focus)
        if (key === 'ArrowDown') {
            event.preventDefault();
            setActiveDropdown(dropdown);
            return;
        }
        
        // Handle Escape to close dropdown
        if (key === 'Escape') {
            event.preventDefault();
            setActiveDropdown(null);
            return;
        }
        
        // Handle Tab - let browser handle tab navigation naturally
        if (key === 'Tab') {
            // Don't close dropdown - let user tab through items
            return;
        }
    };

    const handleLinkClick = () => {
        // Removed custom navigation announcements - screen readers handle this natively
    };

    const handleDropdownItemKeyDown = (event) => {
        const { key } = event;
        
        // Handle Escape to close dropdown and return focus to trigger
        if (key === 'Escape') {
            event.preventDefault();
            setActiveDropdown(null);
            // Return focus to dropdown trigger
            const dropdownTrigger = event.currentTarget.closest('.header-dropdown');
            if (dropdownTrigger) {
                dropdownTrigger.focus();
            }
        }
        
        // Let browser handle Tab navigation naturally through dropdown items
        // Tab will move to next dropdown item or continue to next header element
    };

    const renderDropdownContent = (menuType) => {
        const menu = menuItems[menuType];
        return menu.items.map((item) => (
            <li key={item.id} role="none">
                <Link 
                    to={item.path} 
                    onClick={() => handleLinkClick()}
                    onKeyDown={(e) => handleDropdownItemKeyDown(e)}
                    role="menuitem"
                    tabIndex="0"
                >
                    <MenuItem item={item} />
                </Link>
            </li>
        ));
    };


    return (
        <header className="header" ref={headerRef} role="banner">
            <div className="header-container">
                <div className="header-logo">
                    <Link to="/" aria-label="Zur Startseite">
                        <img 
                            src={darkMode ? "/images/Logo_Sand.svg" : "/images/Logo_Grün.svg"} 
                            alt="Grünerator Logo" 
                        />
                    </Link>
                </div>
                <input 
                    type="checkbox" 
                    id="header-menu-checkbox" 
                    className="header-menu-checkbox" 
                    checked={menuActive} 
                    onChange={toggleMenu}
                    aria-hidden="true"
                />
                <label htmlFor="header-menu-checkbox" className="header-menu-label" aria-label={menuActive ? "Menü schließen" : "Menü öffnen"}>
                    <div className="line"></div>
                    <div className="line"></div>
                    <div className="line"></div>
                </label>
                <nav className={`header-nav ${menuActive ? 'active' : ''}`} id="nav" aria-label="Hauptnavigation">
                    <ul>
                        {Object.entries(menuItems).map(([key, menu]) => (
                            <li key={key} 
                                className="header-dropdown"
                                onMouseEnter={() => handleMouseEnter(key)}
                                onMouseLeave={handleMouseLeave}
                                onFocus={() => handleFocus(key)}
                                onBlur={handleBlur}
                                onKeyDown={(e) => handleKeyDown(e, key)}
                                tabIndex="0"
                                aria-haspopup="true"
                                aria-expanded={activeDropdown === key}
                                role="button"
                            >
                                <span className="header-nav-item">
                                    {/* Icon for top-level item like Labor - REMOVED FOR CONSISTENCY */}
                                    {/* {menu.icon && <menu.icon aria-hidden="true" />} */}
                                    <span>{menu.title}</span>
                                    <PiCaretDown 
                                        className={activeDropdown === key ? 'open' : ''} 
                                        aria-hidden="true" 
                                    />
                                </span>
                                <ul className={`${menuStyles.dropdownContent.base} ${activeDropdown === key ? menuStyles.dropdownContent.show : ''}`} 
                                    aria-label={`${menu.title} Untermenü`}
                                    role="menu"
                                    aria-hidden={activeDropdown !== key}
                                >
                                    {menu.items && menu.items.length > 0 && renderDropdownContent(key)}
                                </ul>
                            </li>
                        ))}
                        {/* Render direct menu items like Suche */}
                        {Object.values(directMenuItems).map(item => (
                            <li key={item.id} className={`header-direct-item header-${item.id}`}>
                                <Link to={item.path} onClick={() => handleLinkClick(item.path, item.title)} className="header-nav-item">
                                    {/* Display icon for direct items - use class for styling */}
                                    {item.icon && <item.icon aria-hidden="true" className="header-direct-item-icon" />}
                                    <span>{item.title}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                <NavMenu 
                    open={menuActive} 
                    onClose={handleNavMenuClose} 
                />
                <div className="header-actions">
                  <ProfileButton />
                  <ThemeToggleButton darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
                </div>
            </div>
        </header>
    );
};

export default Header;