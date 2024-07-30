import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  PiFileText,
  PiNewspaper,
  PiChatsCircle,
  PiDeviceMobile,
  PiCaretDown,
  PiFile,
  PiGlobe,
  PiLink,
  PiLightbulb,
  PiCaretUp,
  PiMicrophone
} from 'react-icons/pi';
import { CSSTransition } from 'react-transition-group';
import '../../../assets/styles/components/navmenu.css';

const NavMenu = ({ open, onClose }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const nodeRefs = {
    grueneratoren: useRef(null),
    gpts: useRef(null),
    gruneratorWeb: useRef(null)
  };

  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [location.pathname]);

  const handleDropdownClick = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  const handleLinkClick = (path) => {
    navigate(path);
    setActiveDropdown(null);
    if (onClose) onClose();
  };

  const handleExternalLinkClick = () => {
    setActiveDropdown(null);
    if (onClose) onClose();
  };

  return (
    <div className={`nav-menu ${open ? 'open' : ''}`}>
      <div className="nav-dropdown">
        <span onClick={() => handleDropdownClick('grueneratoren')}>
          Grüneratoren 
          {activeDropdown === 'grueneratoren' ? 
            <PiCaretUp className="nav-icon dropdown-icon" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'grueneratoren'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.grueneratoren}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.grueneratoren}>
            <li><Link to="/antragsgenerator" onClick={() => handleLinkClick('/antragsgenerator')}><PiFileText className="nav-icon" /> Anträge</Link></li>
            <li><Link to="/pressemitteilung" onClick={() => handleLinkClick('/pressemitteilung')}><PiNewspaper className="nav-icon" /> Pressemitteilungen</Link></li>
            <li><Link to="/socialmedia" onClick={() => handleLinkClick('/socialmedia')}><PiChatsCircle className="nav-icon" /> Social Media</Link></li>
            <li><Link to="/antragsversteher" onClick={() => handleLinkClick('/antragsversteher')}><PiLightbulb className="nav-icon" /> Antrags-Erklärer</Link></li>
            <li><Link to="/rede" onClick={() => handleLinkClick('/rede')}><PiMicrophone className="nav-icon" /> Politische Rede</Link></li>
          </ul>
        </CSSTransition>
      </div>
      <div className="nav-dropdown">
        <span onClick={() => handleDropdownClick('gpts')}>
          GPTs 
          {activeDropdown === 'gpts' ? 
            <PiCaretUp className="nav-icon dropdown-icon" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'gpts'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.gpts}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.gpts}>
            <li><a href="https://chat.openai.com/g/g-Xd3HrGped-wahlprufstein-grunerator" target="_blank" rel="noopener noreferrer" onClick={handleExternalLinkClick}><PiFile className="nav-icon" /> Wahlprüfstein</a></li>
            <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer" onClick={handleExternalLinkClick}><PiGlobe className="nav-icon" /> Social Media</a></li>
          </ul>
        </CSSTransition>
      </div>
      <div className="nav-dropdown">
        <span onClick={() => handleDropdownClick('gruneratorWeb')}>
          Grünerator Web 
          {activeDropdown === 'gruneratorWeb' ? 
            <PiCaretUp className="nav-icon dropdown-icon" /> : 
            <PiCaretDown className="nav-icon dropdown-icon" />
          }
        </span>
        <CSSTransition
          in={activeDropdown === 'gruneratorWeb'}
          timeout={300}
          classNames="dropdown"
          unmountOnExit
          nodeRef={nodeRefs.gruneratorWeb}
        >
          <ul className="nav-dropdown-content" ref={nodeRefs.gruneratorWeb}>
            <li><Link to="/webbaukasten" onClick={() => handleLinkClick('/webbaukasten')}><PiDeviceMobile className="nav-icon" /> Webbaukasten</Link></li>
            <li><a href="https://person.webbegruenung.de" target="_blank" rel="noopener noreferrer" onClick={handleExternalLinkClick}><PiLink className="nav-icon" /> Demo-Seite</a></li>
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
