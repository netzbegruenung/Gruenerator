//header.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import NavMenu from './NavMenu';
import ProfileButton from './ProfileButton';
import ThemeToggleButton from './ThemeToggleButton';
import useDarkMode from '../../hooks/useDarkMode';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, MenuItem, menuStyles } from './menuData';
import Icon from '../../common/Icon';

import { useLazyAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';

const Header = () => {
    useLazyAuth(); // Keep for other auth functionality
    const location = useLocation();
    const { getBetaFeatureState } = useBetaFeatures();

    const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
    const youBetaEnabled = useMemo(() => getBetaFeatureState('you'), [getBetaFeatureState]);
    const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [scrolled, setScrolled] = useState(false);
    const [darkMode, toggleDarkMode] = useDarkMode();
    const { announce } = useAccessibility();
    const headerRef = useRef(null);
    const closeTimeoutRef = useRef(null);

    // Memoize menu items to prevent unnecessary recalculations
    const menuItems = useMemo(() => getMenuItems({ databaseBetaEnabled, youBetaEnabled, chatBetaEnabled }), [databaseBetaEnabled, youBetaEnabled, chatBetaEnabled]);
    const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, youBetaEnabled, chatBetaEnabled }), [databaseBetaEnabled, youBetaEnabled, chatBetaEnabled]);

    // Close dropdown when location changes (navigation occurs)
    useEffect(() => {
        setActiveDropdown(null);
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, [location.pathname]);


    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, []);

    // Handle scroll for compact header
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Removed deprecated setupKeyboardNav - browser handles keyboard navigation natively

    const toggleMenu = () => {
        setMenuActive(!menuActive);
        // Reduced announcements - screen readers handle menu state natively
    };


    const handleNavMenuClose = () => {
        setMenuActive(false);
    };

    const handleMouseEnter = (dropdown) => {
        // Clear any pending close timeout
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setActiveDropdown(dropdown);
    };

    const handleMouseLeave = (event) => {
        // Check if the mouse is moving to an element that's part of the dropdown
        const relatedTarget = event.relatedTarget;
        
        // If relatedTarget is null or not a DOM node, close the dropdown
        if (relatedTarget && relatedTarget instanceof Node) {
            const dropdownContainer = event.currentTarget.closest('.header-dropdown');
            
            // Check if the mouse is moving to something within the same dropdown container
            if (dropdownContainer && dropdownContainer.contains(relatedTarget)) {
                // Don't close - mouse is still within the dropdown area
                return;
            }
            
            // Check if moving to the dropdown content
            const dropdownContent = dropdownContainer?.querySelector('.header-dropdown-content');
            if (dropdownContent && dropdownContent.contains(relatedTarget)) {
                // Don't close - mouse is moving to dropdown content
                return;
            }
        }
        
        // Mouse is leaving the dropdown area, close with a small delay
        closeTimeoutRef.current = setTimeout(() => {
            setActiveDropdown(null);
            closeTimeoutRef.current = null;
        }, 200);
    };

    const handleHeaderMouseEnter = () => {
        // Cancel any pending close when mouse re-enters header area
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };

    const handleHeaderMouseLeave = () => {
        // Close dropdown when leaving entire header area
        setActiveDropdown(null);
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
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

    const handleLinkClick = (event) => {
        // Prevent event bubbling
        event.stopPropagation();
        
        // Close dropdown and mobile menu immediately
        setActiveDropdown(null);
        setMenuActive(false);
        
        // Force blur any focused dropdown elements to clear focus-within state
        if (document.activeElement && document.activeElement.closest('.header-dropdown')) {
            document.activeElement.blur();
        }
        
        // Clear any potential hover states by forcing a layout recalculation
        if (headerRef.current) {
            const style = headerRef.current.style;
            style.pointerEvents = 'none';
            // Use requestAnimationFrame to restore pointer events after navigation
            requestAnimationFrame(() => {
                if (headerRef.current) {
                    style.pointerEvents = '';
                }
            });
        }
    };

    const renderDropdownContent = (menuType) => {
        const menu = menuItems[menuType];
        return menu.items.map((item) => (
            <li key={item.id} role="none">
                <Link 
                    to={item.path} 
                    onClick={(e) => handleLinkClick(e)}
                    role="menuitem"
                    tabIndex="0"
                >
                    <MenuItem item={item} />
                </Link>
            </li>
        ));
    };


    return (
        <header className={`header ${scrolled ? 'scrolled' : ''}`} ref={headerRef} role="banner" onMouseEnter={handleHeaderMouseEnter} onMouseLeave={handleHeaderMouseLeave}>
            <div className="header-container">
                <div className="header-logo">
                    <Link to="/" aria-label="Zur Startseite">
                        <img
                            src={darkMode ? "/images/gruenerator_logo_weiss.svg" : "/images/gruenerator_logo_gruen.svg"}
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
                                onMouseLeave={(e) => handleMouseLeave(e)}
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
                                    <Icon 
                                        category="ui" 
                                        name="caretDown" 
                                        className={activeDropdown === key ? 'open' : ''} 
                                        aria-hidden="true" 
                                    />
                                </span>
                                <ul className={`${menuStyles.dropdownContent.base} ${activeDropdown === key ? menuStyles.dropdownContent.show : ''}`} 
                                    aria-label={`${menu.title} Untermenü`}
                                    role="menu"
                                    aria-hidden={activeDropdown !== key}
                                    onMouseLeave={(e) => handleMouseLeave(e)}
                                >
                                    {menu.items && menu.items.length > 0 && renderDropdownContent(key)}
                                </ul>
                            </li>
                        ))}
                        {/* Render direct menu items like Suche */}
                        {Object.values(directMenuItems).map(item => (
                            <li key={item.id} className={`header-direct-item header-${item.id}`}>
                                <Link to={item.path} onClick={(e) => handleLinkClick(e)} className="header-nav-item">
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