//header.js
import React, { useState, useEffect, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { PiCaretDown, PiSun, PiMoon } from 'react-icons/pi';
import NavMenu from './NavMenu';
import ProfileButton from './ProfileButton';
import ThemeToggleButton from './ThemeToggleButton';
import useDarkMode from '../../hooks/useDarkMode';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, MenuItem, menuStyles, handleMenuInteraction } from './menuData';
import { FormContext } from '../../utils/FormContext';
import { useLazyAuth } from '../../../hooks/useAuth';

const Header = () => {
    const { isEditing } = useContext(FormContext);
    const { betaFeatures } = useLazyAuth();
    const sharepicBetaEnabled = betaFeatures?.sharepic === true;
    const databaseBetaEnabled = betaFeatures?.database === true;
    const youBetaEnabled = betaFeatures?.you === true;
    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [darkMode, toggleDarkMode] = useDarkMode();
    const { announce, setupKeyboardNav } = useAccessibility();
    const headerRef = useRef(null);

    const menuItems = getMenuItems({ sharepicBetaEnabled, databaseBetaEnabled, youBetaEnabled });
    const directMenuItems = getDirectMenuItems({ sharepicBetaEnabled, databaseBetaEnabled, youBetaEnabled });

    useEffect(() => {
        const headerElements = headerRef.current.querySelectorAll('a, button, .header-dropdown > span');
        const cleanup = setupKeyboardNav(Array.from(headerElements));
        return cleanup;
    }, [setupKeyboardNav]);

    const toggleMenu = () => {
        setMenuActive(!menuActive);
        announce(menuActive ? 'Hauptmenü geschlossen' : 'Hauptmenü geöffnet');
    };

    const handleMouseEnter = (dropdown) => {
        setActiveDropdown(dropdown);
    };

    const handleMouseLeave = () => {
        setActiveDropdown(null);
    };

    const handleNavMenuClose = () => {
        setMenuActive(false);
    };

    const handleKeyDown = (event, dropdown) => {
        handleMenuInteraction(event, 'keydown', () => {
            setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
            announce(activeDropdown === dropdown ? `${dropdown} Untermenü geschlossen` : `${dropdown} Untermenü geöffnet`);
        });
    };

    const handleLinkClick = (path, label) => {
        announce(`Navigation zu ${label}`);
    };

    const renderDropdownContent = (menuType) => {
        const menu = menuItems[menuType];
        return menu.items.map(item => (
            <li key={item.id}>
                <Link to={item.path} onClick={() => handleLinkClick(item.path, item.title)}>
                    <MenuItem item={item} />
                </Link>
            </li>
        ));
    };

    if (isEditing) return null;

    return (
        <header className="header" ref={headerRef}>
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
                                onKeyDown={(e) => handleKeyDown(e, key)}
                                tabIndex="0"
                                aria-haspopup="true"
                                aria-expanded={activeDropdown === key}
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