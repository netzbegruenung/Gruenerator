import React, { useContext, useState } from 'react';
import PropTypes from 'prop-types';
import { FaTwitter, FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaWhatsapp, FaLightbulb, FaVideo, FaNewspaper, FaSearch, FaList, FaFileAlt, FaBookmark } from 'react-icons/fa';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { FormContext } from '../utils/FormContext';
import { copyPlainText } from '../utils/commonFunctions';

const PLATFORM_CONFIG = {
  'TWITTER': {
    displayName: 'Twitter',
    icon: FaTwitter,
    color: '#1DA1F2',
    copyText: 'Tweet kopieren'
  },
  'FACEBOOK': {
    displayName: 'Facebook',
    icon: FaFacebook,
    color: '#4267B2',
    copyText: 'Facebook-Post kopieren'
  },
  'INSTAGRAM': {
    displayName: 'Instagram',
    icon: FaInstagram,
    color: '#E1306C',
    copyText: 'Instagram-Post kopieren'
  },
  'LINKEDIN': {
    displayName: 'LinkedIn',
    icon: FaLinkedin,
    color: '#0077B5',
    copyText: 'LinkedIn-Post kopieren'
  },
  'TIKTOK': {
    displayName: 'TikTok',
    icon: FaTiktok,
    color: '#000000',
    copyText: 'TikTok-Text kopieren'
  },
  'MESSENGER': {
    displayName: 'Messenger',
    icon: FaWhatsapp,
    color: '#25D366',
    copyText: 'Messenger-Text kopieren'
  },
  'ACTIONIDEAS': {
    displayName: 'Aktionsideen',
    icon: FaLightbulb,
    color: '#4caf50',
    copyText: 'Aktionsidee kopieren'
  },
  'INSTAGRAM REEL': {
    displayName: 'Instagram Reel',
    icon: FaVideo,
    color: '#E1306C',
    copyText: 'Reel-Text kopieren'
  },
  'PRESSEMITTEILUNG': {
    displayName: 'Pressemitteilung',
    icon: FaNewspaper,
    color: '#2E7D32',
    copyText: 'Pressemitteilung kopieren'
  },
  'SUCHANFRAGE': {
    displayName: 'Suchanfrage',
    icon: FaSearch,
    color: '#FF9800',
    copyText: 'Suchanfrage kopieren'
  },
  'SUCHERGEBNIS': {
    displayName: 'Suchergebnisse',
    icon: FaList,
    color: '#4285F4',
    copyText: 'Suchergebnisse kopieren'
  },
  'ANTRAG': {
    displayName: 'Antrag',
    icon: FaFileAlt,
    color: '#388E3C',
    copyText: 'Antrag kopieren'
  },
  'QUELLEN': {
    displayName: 'Quellen',
    icon: FaBookmark,
    color: '#607D8B',
    copyText: 'Quellen kopieren'
  }
};

const PlatformContainer = ({ content }) => {
  const { isEditing } = useContext(FormContext);
  const [copiedPlatform, setCopiedPlatform] = useState(null);

  const handleCopyPlatformContent = (content) => {
    // Extrahiere Plain Text aus HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const plainText = tempDiv.innerText;
    
    copyPlainText(plainText);
    setCopiedPlatform(content);
    setTimeout(() => {
      setCopiedPlatform(null);
    }, 2000);
  };

  const extractPlatformSections = (htmlContent) => {
    if (!htmlContent) return [];

    // Erstelle temporären Container zum Parsen des HTMLs
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Finde alle h2-Überschriften
    const headers = tempDiv.querySelectorAll('h2');
    if (!headers.length) return [];

    // Extrahiere Abschnitte
    return Array.from(headers).map((header, index) => {
      const platform = header.innerText.trim().toUpperCase();
      let content = '';
      
      // Sammle allen Content bis zur nächsten h2 oder bis zum Ende
      let currentNode = header.nextSibling;
      while (currentNode && currentNode.tagName !== 'H2') {
        content += currentNode.outerHTML || currentNode.textContent;
        currentNode = currentNode.nextSibling;
      }

      return {
        platform,
        content: content.trim()
      };
    });
  };

  const renderPlatformSections = () => {
    if (!content) return null;

    const sections = extractPlatformSections(content);
    if (!sections.length) return content; // Fallback: zeige Original-Content

    return (
      <div className="platforms-container">
        {sections.map((section, index) => renderPlatformCard(section.platform, section.content, index))}
      </div>
    );
  };

  const renderPlatformCard = (platform, content, key) => {
    const config = PLATFORM_CONFIG[platform] || {
      displayName: platform,
      icon: FaSearch,
      color: '#757575',
      copyText: 'Inhalt kopieren'
    };
    const Icon = config.icon;
    const isCopied = copiedPlatform === content;

    return (
      <div key={`${platform}-${key}`} className="platform-content">
        <div className="platform-header">
          <div className="platform-title">
            <div className="platform-icon" style={{ color: config.color }}>
              <Icon size={20} />
            </div>
            <h3 className="platform-name">{config.displayName}</h3>
          </div>
          <div className="display-actions">
            <button
              onClick={() => handleCopyPlatformContent(content)}
              className="action-button"
              aria-label={config.copyText}
              data-tooltip-id="action-tooltip"
              data-tooltip-content={config.copyText}
            >
              {isCopied ? <IoCheckmarkOutline size={16} /> : <IoCopyOutline size={16} />}
            </button>
          </div>
        </div>
        <hr className="platform-divider" style={{ borderColor: `${config.color}40` }} />
        <div className="platform-body">
          <div className="generated-content-wrapper">
            <div dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        </div>
      </div>
    );
  };

  return renderPlatformSections();
};

PlatformContainer.propTypes = {
  content: PropTypes.string
};

export default PlatformContainer; 