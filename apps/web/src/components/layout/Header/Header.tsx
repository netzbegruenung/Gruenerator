//header.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import NavMenu from './NavMenu';
import ProfileButton from './ProfileButton';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, MenuItem, menuStyles } from './menuData';
import Icon from '../../common/Icon';

import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import useHeaderStore from '../../../stores/headerStore';

const Header = () => {
    useLazyAuth(); // Keep for other auth functionality
    const { user } = useOptimizedAuth();
    const location = useLocation();
    const { getBetaFeatureState } = useBetaFeatures();
    const forceShrunk = useHeaderStore((state) => state.forceShrunk);

    const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
    const youBetaEnabled = useMemo(() => getBetaFeatureState('you'), [getBetaFeatureState]);
    const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
    const igelModeEnabled = useMemo(() => getBetaFeatureState('igel_modus'), [getBetaFeatureState]);
    const locale = useAuthStore((state) => state.locale);
    const isAustrian = locale === 'de-AT';

    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [scrolled, setScrolled] = useState(false);
    const [darkMode, setDarkMode] = useState(() =>
        document.documentElement.getAttribute('data-theme') === 'dark'
    );

    // Listen for theme changes from Footer's toggle
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    setDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);
    const { announce } = useAccessibility();
    const headerRef = useRef(null);
    const closeTimeoutRef = useRef(null);
    const openTimeoutRef = useRef(null);

    // Memoize menu items to prevent unnecessary recalculations
    const menuItems = useMemo(() => getMenuItems(
        { databaseBetaEnabled, youBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian }
    ), [databaseBetaEnabled, youBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian]);
    const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, youBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian }), [databaseBetaEnabled, youBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian]);

    // Close dropdown when location changes (navigation occurs)
    useEffect(() => {
        setActiveDropdown(null);
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, [location.pathname]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
            if (openTimeoutRef.current) {
                clearTimeout(openTimeoutRef.current);
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
        // Clear any pending timeouts
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        if (openTimeoutRef.current) {
            clearTimeout(openTimeoutRef.current);
            openTimeoutRef.current = null;
        }

        // Set active dropdown immediately for better responsiveness
        // The CSS transition will handle the smooth appearance
        setActiveDropdown(dropdown);
    };

    const handleMouseLeave = (event) => {
        // Get the dropdown container element
        const dropdownContainer = event.currentTarget;
        const relatedTarget = event.relatedTarget;

        // Clear any pending open timeout when leaving
        if (openTimeoutRef.current) {
            clearTimeout(openTimeoutRef.current);
            openTimeoutRef.current = null;
        }

        // Check if we're moving to another element
        if (relatedTarget && relatedTarget instanceof Node) {
            // Check if still within the dropdown container or its children
            if (dropdownContainer && dropdownContainer.contains(relatedTarget)) {
                // Still within dropdown, don't close
                return;
            }

            // Check if moving to another dropdown trigger
            const targetDropdown = relatedTarget.closest('.header-dropdown');
            if (targetDropdown && targetDropdown !== dropdownContainer) {
                // Moving to another dropdown, close immediately
                setActiveDropdown(null);
                return;
            }
        }

        // Add delay before closing to prevent flickering
        // This gives time for the mouse to move between trigger and content
        closeTimeoutRef.current = setTimeout(() => {
            setActiveDropdown(null);
            closeTimeoutRef.current = null;
        }, 100); // Reduced from 200ms for better UX
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
        return menu.items.map((item) => {
            // Handle items with sub-menus
            if (item.hasSubmenu && item.items) {
                return (
                    <li key={item.id} role="none" className="has-submenu">
                        <span
                            className="submenu-trigger"
                            role="menuitem"
                            tabIndex="0"
                            aria-haspopup="true"
                        >
                            <MenuItem item={item} />
                            <Icon
                                category="ui"
                                name="caretDown"
                                className="submenu-caret"
                                aria-hidden="true"
                            />
                        </span>
                        <ul className="submenu-content" role="menu" aria-label={`${item.title} Untermenü`}>
                            {item.items.map((subItem) => (
                                <li key={subItem.id} role="none">
                                    <Link
                                        to={subItem.path}
                                        onClick={(e) => handleLinkClick(e)}
                                        role="menuitem"
                                        tabIndex="0"
                                    >
                                        <MenuItem item={subItem} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </li>
                );
            }

            // Regular menu items
            return (
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
            );
        });
    };

    return (
        <header className={`header ${scrolled || forceShrunk ? 'scrolled' : ''}`} ref={headerRef} role="banner">
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
                </div>
            </div>
        </header>
    );
};

export default Header;
