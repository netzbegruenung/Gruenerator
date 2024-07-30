import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PiFileText, PiNewspaper, PiChatsCircle, PiDeviceMobile, PiCaretDown, PiFile, PiGlobe, PiLink, PiMicrophone, PiLightbulb, PiSun, PiMoon } from 'react-icons/pi';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/header.css';
import NavMenu from './NavMenu';
import useDarkMode from '../../hooks/useDarkMode';

const Header = () => {
    const [menuActive, setMenuActive] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [darkMode, toggleDarkMode] = useDarkMode();

    const toggleMenu = () => {
        setMenuActive(!menuActive);
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

    return (
        <header className="header">
            <div className="header-container">
                <div className="header-logo">
                    <Link to="/">
                        <img 
                            src={darkMode ? "/images/Logo_Sand.svg" : "/images/Logo_Grün.svg"} 
                            alt="Grünerator Logo" 
                        />
                    </Link>
                </div>
                <input type="checkbox" id="header-menu-checkbox" className="header-menu-checkbox" checked={menuActive} onChange={toggleMenu} />
                <label htmlFor="header-menu-checkbox" className="header-menu-label">
                    <div className="line"></div>
                    <div className="line"></div>
                    <div className="line"></div>
                </label>
                <nav className={`header-nav ${menuActive ? 'active' : ''}`} id="nav">
                    <ul>
                        <li className="header-dropdown" onMouseEnter={() => handleMouseEnter('grueneratoren')} onMouseLeave={handleMouseLeave}>
                            <span>
                                Grüneratoren <PiCaretDown className={activeDropdown === 'grueneratoren' ? 'open' : ''} />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'grueneratoren' ? 'show' : ''}`}>
                                <li><Link to="/antragsgenerator"><PiFileText /> Anträge</Link></li>
                                <li><Link to="/pressemitteilung"><PiNewspaper /> Pressemitteilungen</Link></li>
                                <li><Link to="/socialmedia"><PiChatsCircle /> Social Media</Link></li>
                                <li><Link to="/rede"><PiMicrophone /> Politische Rede</Link></li>
                                <li><Link to="/antragsversteher"><PiLightbulb /> Antrags-Erklärer</Link></li>
                            </ul>
                        </li>
                        <li className="header-dropdown" onMouseEnter={() => handleMouseEnter('gpts')} onMouseLeave={handleMouseLeave}>
                            <span>
                                GPTs <PiCaretDown className={activeDropdown === 'gpts' ? 'open' : ''} />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'gpts' ? 'show' : ''}`}>
                                <li><a href="https://chat.openai.com/g/g-Xd3HrGped-wahlprufstein-grunerator" target="_blank" rel="noopener noreferrer"><PiFile /> Wahlprüfstein</a></li>
                                <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer"><PiGlobe /> Social Media</a></li>
                            </ul>
                        </li>
                        <li className="header-dropdown" onMouseEnter={() => handleMouseEnter('gruneratorWeb')} onMouseLeave={handleMouseLeave}>
                            <span>
                                Grünerator Web <PiCaretDown className={activeDropdown === 'gruneratorWeb' ? 'open' : ''} />
                            </span>
                            <ul className={`header-dropdown-content ${activeDropdown === 'gruneratorWeb' ? 'show' : ''}`}>
                                <li><Link to="/webbaukasten"><PiDeviceMobile /> Webbaukasten</Link></li>
                                <li><a href="https://person.webbegruenung.de" target="_blank" rel="noopener noreferrer"><PiLink /> Demo-Seite</a></li>
                            </ul>
                        </li>
                    </ul>
                </nav>
                <NavMenu open={menuActive} onClose={handleNavMenuClose} />
                <div className="header-toggle">
                    <label className="switch">
                        <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
                        <span className="slider round">
                            <PiSun className="icon sun" />
                            <PiMoon className="icon moon" />
                        </span>
                    </label>
                </div>
            </div>
        </header>
    );
};

export default Header;