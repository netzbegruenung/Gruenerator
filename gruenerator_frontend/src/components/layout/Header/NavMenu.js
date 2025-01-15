import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  PiFileText,
  PiNewspaper,
  PiInstagramLogo,
  PiCaretDown,
  PiCaretUp,
  PiMicrophone,
  PiBook,
  PiImage,
  PiPaintBrush,
  PiMagicWand
} from 'react-icons/pi';
import { CSSTransition } from 'react-transition-group';
import useAccessibility from '../../hooks/useAccessibility';

const NavMenu = ({ open, onClose }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce, setupKeyboardNav } = useAccessibility();
  const navMenuRef = useRef(null);
  const nodeRefs = {
    texte: useRef(null),
    grafik: useRef(null),
    gpts: useRef(null)
  };

  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (open && navMenuRef.current) {
      const menuElements = navMenuRef.current.querySelectorAll('a, button, .nav-dropdown > span');
      const cleanup = setupKeyboardNav(Array.from(menuElements));
      return cleanup;
    }
  }, [open, setupKeyboardNav]);

  const handleDropdownClick = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
    announce(activeDropdown === dropdown ? `${dropdown} Untermenü geschlossen` : `${dropdown} Untermenü geöffnet`);
  };

  const handleLinkClick = (path, label) => {
    navigate(path);
    setActiveDropdown(null);
    if (onClose) onClose();
    announce(`Navigation zu ${label}`);
  };

  const handleKeyDown = (event, dropdown) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleDropdownClick(dropdown);
    }
  };

  return (
    <div 
      className={`nav-menu ${open ? 'open' : ''}`} 
      ref={navMenuRef} 
      aria-label="Mobile Navigation" 
      role="navigation"
    >
      {/* Texte Dropdown */}
      <div className="nav-dropdown">
        <span 
          onClick={() => handleDropdownClick('texte')}
          onKeyDown={(e) => handleKeyDown(e, 'texte')}
          tabIndex="0"
          role="button"
          aria-haspopup="true"
          aria-expanded={activeDropdown === 'texte'}
        >
          Texte 
          {activeDropdown === 'texte' ? 
            <PiCaretUp className="nav-icon dropdown-icon" aria-hidden="true" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" aria-hidden="true" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'texte'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.texte}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.texte} aria-label="Texte Untermenü">
            <li><Link to="/antrag" onClick={() => handleLinkClick('/antragsgenerator', 'Anträge')}><PiFileText className="nav-icon" aria-hidden="true" /> Anträge</Link></li>
            <li><Link to="/pressemitteilung" onClick={() => handleLinkClick('/pressemitteilung', 'Pressemitteilungen')}><PiNewspaper className="nav-icon" aria-hidden="true" /> Pressemitteilungen</Link></li>
            <li><Link to="/socialmedia" onClick={() => handleLinkClick('/socialmedia', 'Social Media')}><PiInstagramLogo className="nav-icon" aria-hidden="true" /> Social Media</Link></li>
            <li><Link to="/rede" onClick={() => handleLinkClick('/rede', 'Politische Rede')}><PiMicrophone className="nav-icon" aria-hidden="true" /> Politische Rede</Link></li>
            <li><Link to="/universal" onClick={() => handleLinkClick('/universal', 'Universal')}><PiMagicWand className="nav-icon" aria-hidden="true" /> Universal</Link></li>
            <li><Link to="/wahlprogramm" onClick={() => handleLinkClick('/wahlprogramm', 'Wahlprogramm')}><PiBook className="nav-icon" aria-hidden="true" /> Wahlprogramm</Link></li>
            <li><Link to="/btw-kompass" onClick={() => handleLinkClick('/btw-kompass', 'BTW Programm-Kompass')}><PiBook className="nav-icon" aria-hidden="true" /> BTW Programm-Kompass</Link></li>
          </ul>
        </CSSTransition>
      </div>

      {/* Sharepics & Grafik Dropdown */}
      <div className="nav-dropdown">
        <span 
          onClick={() => handleDropdownClick('grafik')}
          onKeyDown={(e) => handleKeyDown(e, 'grafik')}
          tabIndex="0"
          role="button"
          aria-haspopup="true"
          aria-expanded={activeDropdown === 'grafik'}
        >
          Sharepics & Grafik 
          {activeDropdown === 'grafik' ? 
            <PiCaretUp className="nav-icon dropdown-icon" aria-hidden="true" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" aria-hidden="true" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'grafik'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.grafik}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.grafik} aria-label="Sharepics & Grafik Untermenü">
            <li><Link to="/vorlagen" onClick={() => handleLinkClick('/vorlagen', 'Canva-Vorlagen')}><PiPaintBrush className="nav-icon" aria-hidden="true" /> Canva-Vorlagen</Link></li>
            <li><Link to="/sharepic" onClick={() => handleLinkClick('/sharepic', 'Sharepic Grünerator')}><PiImage className="nav-icon" aria-hidden="true" /> Sharepic Grünerator</Link></li>
          </ul>
        </CSSTransition>
      </div>

      {/* GPTs Dropdown */}
      <div className="nav-dropdown">
        <span 
          onClick={() => handleDropdownClick('gpts')}
          onKeyDown={(e) => handleKeyDown(e, 'gpts')}
          tabIndex="0"
          role="button"
          aria-haspopup="true"
          aria-expanded={activeDropdown === 'gpts'}
        >
          GPTs für ChatGPT 
          {activeDropdown === 'gpts' ? 
            <PiCaretUp className="nav-icon dropdown-icon" aria-hidden="true" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" aria-hidden="true" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'gpts'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.gpts}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.gpts} aria-label="GPTs Untermenü">
            <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne externen Link: Social Media')}><PiInstagramLogo className="nav-icon" aria-hidden="true" /> Social Media</a></li>
            <li><a href="https://chatgpt.com/g/g-Npcb04iH7-grunerator-pressemitteilungen" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne externen Link: Pressemitteilung')}><PiNewspaper className="nav-icon" aria-hidden="true" /> Pressemitteilung</a></li>
          </ul>
        </CSSTransition>
      </div>
    </div>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NavMenu;