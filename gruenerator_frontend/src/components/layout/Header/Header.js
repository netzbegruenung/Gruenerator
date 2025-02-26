//header.js
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PiCaretDown, PiSun, PiMoon, PiMagnifyingGlass } from 'react-icons/pi';
import NavMenu from './NavMenu';
import useDarkMode from '../../hooks/useDarkMode';
import useAccessibility from '../../hooks/useAccessibility';
import { menuItems, MenuItem, menuStyles, handleMenuInteraction } from './menuData';

const Header = () => {
    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [darkMode, toggleDarkMode] = useDarkMode();
    const { announce, setupKeyboardNav } = useAccessibility();
    const headerRef = useRef(null);

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
                                <span>
                                    {menu.title} <PiCaretDown className={activeDropdown === key ? 'open' : ''} aria-hidden="true" />
                                </span>
                                <ul className={`${menuStyles.dropdownContent.base} ${activeDropdown === key ? menuStyles.dropdownContent.show : ''}`} 
                                    aria-label={`${menu.title} Untermenü`}
                                >
                                    {renderDropdownContent(key)}
                                </ul>
                            </li>
                        ))}
                        <li>
                            <Link to="/suche" onClick={() => handleLinkClick('/suche', 'Suche')}>
                                Suche <PiMagnifyingGlass className="search-icon" aria-hidden="true" />
                            </Link>
                        </li>
                    </ul>
                </nav>
                <NavMenu open={menuActive} onClose={handleNavMenuClose} />
                <div className="header-toggle">
                    <label className="switch" aria-label={darkMode ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}>
                        <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
                        <span className="slider round">
                            <PiSun className="icon sun" aria-hidden="true" />
                            <PiMoon className="icon moon" aria-hidden="true" />
                        </span>
                    </label>
                </div>
            </div>
        </header>
    );
};

export default Header;