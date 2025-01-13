//header.js
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PiFileText, PiNewspaper, PiInstagramLogo, PiCaretDown, PiMicrophone, PiSun, PiMoon, PiBook, PiImage, PiPaintBrush, PiMagicWand } from 'react-icons/pi';
import NavMenu from './NavMenu';
import useDarkMode from '../../hooks/useDarkMode';
import useAccessibility from '../../hooks/useAccessibility';

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
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
            announce(activeDropdown === dropdown ? `${dropdown} Untermenü geschlossen` : `${dropdown} Untermenü geöffnet`);
        }
    };

    const handleLinkClick = (path, label) => {
        announce(`Navigation zu ${label}`);
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
                        <li className="header-dropdown" 
                            onMouseEnter={() => handleMouseEnter('texte')} 
                            onMouseLeave={handleMouseLeave}
                            onKeyDown={(e) => handleKeyDown(e, 'texte')}
                            tabIndex="0"
                            aria-haspopup="true"
                            aria-expanded={activeDropdown === 'texte'}
                        >
                            <span>
                                Texte <PiCaretDown className={activeDropdown === 'texte' ? 'open' : ''} aria-hidden="true" />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'texte' ? 'show' : ''}`} aria-label="Texte Untermenü">
                                <li><Link to="/antrag" onClick={() => handleLinkClick('/antragsgenerator', 'Anträge')}><PiFileText aria-hidden="true" /> Anträge</Link></li>
                                <li><Link to="/pressemitteilung" onClick={() => handleLinkClick('/pressemitteilung', 'Pressemitteilungen')}><PiNewspaper aria-hidden="true" /> Pressemitteilungen</Link></li>
                                <li><Link to="/socialmedia" onClick={() => handleLinkClick('/socialmedia', 'Social Media')}><PiInstagramLogo aria-hidden="true" /> Social Media</Link></li>
                                <li><Link to="/rede" onClick={() => handleLinkClick('/rede', 'Politische Rede')}><PiMicrophone aria-hidden="true" /> Politische Rede</Link></li>
                                <li><Link to="/universal" onClick={() => handleLinkClick('/universal', 'Universal')}><PiMagicWand aria-hidden="true" /> Universal</Link></li>
                                <li><Link to="/wahlprogramm" onClick={() => handleLinkClick('/wahlprogramm', 'Wahlprogramm')}><PiBook aria-hidden="true" /> Wahlprogramm</Link></li>
                                <li><Link to="/btw-kompass" onClick={() => handleLinkClick('/btw-kompass', 'BTW Programm-Kompass')}><PiBook aria-hidden="true" /> BTW Programm-Kompass</Link></li>
                            </ul>
                        </li>
                        <li className="header-dropdown" 
                            onMouseEnter={() => handleMouseEnter('grafik')} 
                            onMouseLeave={handleMouseLeave}
                            onKeyDown={(e) => handleKeyDown(e, 'grafik')}
                            tabIndex="0"
                            aria-haspopup="true"
                            aria-expanded={activeDropdown === 'grafik'}
                        >
                            <span>
                                Sharepics & Grafik <PiCaretDown className={activeDropdown === 'grafik' ? 'open' : ''} aria-hidden="true" />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'grafik' ? 'show' : ''}`} aria-label="Sharepics & Grafik Untermenü">
                                <li><Link to="/vorlagen" onClick={() => handleLinkClick('/vorlagen', 'Canva-Vorlagen')}><PiPaintBrush aria-hidden="true" /> Canva-Vorlagen</Link></li>
                                <li><Link to="/sharepic" onClick={() => handleLinkClick('/sharepic', 'Sharepic Grünerator')}><PiImage aria-hidden="true" /> Sharepic Grünerator</Link></li>
                            </ul>
                        </li>
                        <li className="header-dropdown" 
                            onMouseEnter={() => handleMouseEnter('gpts')} 
                            onMouseLeave={handleMouseLeave}
                            onKeyDown={(e) => handleKeyDown(e, 'gpts')}
                            tabIndex="0"
                            aria-haspopup="true"
                            aria-expanded={activeDropdown === 'gpts'}
                        >
                            <span>
                                GPTs für ChatGPT <PiCaretDown className={activeDropdown === 'gpts' ? 'open' : ''} aria-hidden="true" />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'gpts' ? 'show' : ''}`} aria-label="GPTs Untermenü">
                                <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne externen Link: Social Media')}><PiInstagramLogo aria-hidden="true" /> Social Media</a></li>
                                <li><a href="https://chatgpt.com/g/g-Npcb04iH7-grunerator-pressemitteilungen" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne externen Link: Pressemitteilung')}><PiNewspaper aria-hidden="true" /> Pressemitteilung</a></li>
                            </ul>
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