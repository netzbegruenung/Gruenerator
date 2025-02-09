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
  PiMagicWand,
  PiMagnifyingGlass
} from 'react-icons/pi';
import { GiHedgehog } from 'react-icons/gi';
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
      <Link to="/suche" className="nav-link" onClick={() => handleLinkClick('/suche', 'Suche')}>
        <PiMagnifyingGlass className="nav-icon" aria-hidden="true" /> Suche
      </Link>

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
            <li><Link to="/gruene-jugend" onClick={() => handleLinkClick('/gruene-jugend', 'Grüne Jugend')}><GiHedgehog className="nav-icon" aria-hidden="true" /> Grüne Jugend</Link></li>
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
    </div>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NavMenu;