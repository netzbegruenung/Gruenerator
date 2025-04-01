import React, { useContext, useState } from 'react';
import PropTypes from 'prop-types';
import { FaTwitter, FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaWhatsapp, FaLightbulb, FaVideo, FaNewspaper, FaSearch, FaList, FaFileAlt, FaBookmark } from 'react-icons/fa';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { FormContext } from '../utils/FormContext';
import { copyPlainText } from '../utils/commonFunctions';
import Editor from './editor/Editor';

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
    copyPlainText(content);
    setCopiedPlatform(content);
    setTimeout(() => {
      setCopiedPlatform(null);
    }, 2000);
  };

  const cleanHtmlButKeepLinebreaks = (html) => {
    if (!html) return '';
    return html
      .replace(/<p>/g, '')
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  };

  const renderPlatformSections = () => {
    if (!content) return null;

    // Entferne HTML-Tags und bereinige den Text
    const cleanContent = cleanHtmlButKeepLinebreaks(content);
    
    // Prüfe, ob der Inhalt durch Platform Breaks getrennt ist
    if (cleanContent.includes('---PLATFORM_BREAK---')) {
      const sections = cleanContent.split('---PLATFORM_BREAK---');
      
      return (
        <div className="platforms-container">
          {sections.map((section, idx) => {
            if (!section.trim()) return null;
            
            // Suche nach Plattform-Markierungen
            const platformMatch = section.match(/(TWITTER|FACEBOOK|INSTAGRAM|LINKEDIN|TIKTOK|MESSENGER|ACTIONIDEAS|INSTAGRAM REEL|PRESSEMITTEILUNG|SUCHANFRAGE|SUCHERGEBNIS|ANTRAG|QUELLEN):\s*/);
            
            if (platformMatch) {
              const platform = platformMatch[1];
              const sectionContent = section.slice(platformMatch.index + platformMatch[0].length).trim();
              return renderPlatformCard(platform, sectionContent, idx);
            } else {
              // Falls keine Plattform erkannt wurde, zeige den Inhalt ohne Formatierung
              return <div key={idx} className="plain-content">{section}</div>;
            }
          })}
        </div>
      );
    }
    
    // Falls keine Platform Breaks vorhanden sind, verwende die bestehende Methode
    const matches = [...cleanContent.matchAll(/(TWITTER|FACEBOOK|INSTAGRAM|LINKEDIN|TIKTOK|MESSENGER|ACTIONIDEAS|INSTAGRAM REEL|PRESSEMITTEILUNG|SUCHANFRAGE|SUCHERGEBNIS|ANTRAG|QUELLEN):\s*/g)];
    
    // Explizit nach SUCHERGEBNIS und ANTRAG suchen
    const hasSuchergebnis = cleanContent.includes('SUCHERGEBNIS:');
    const hasAntrag = cleanContent.includes('ANTRAG:');
    
    if (matches.length === 0) {
      return cleanContent;
    }
    if (matches.length === 1) {
      return renderSinglePlatform(cleanContent, matches[0]);
    }

    const sections = matches.map((match, index) => {
      const start = match.index + match[0].length;
      const end = index < matches.length - 1 ? matches[index + 1].index : cleanContent.length;
      const platform = match[1];
      const sectionContent = cleanContent.slice(start, end).trim();
      
      return renderPlatformCard(platform, sectionContent, index);
    });

    return <div className="platforms-container">{sections}</div>;
  };

  const renderSinglePlatform = (content, match) => {
    const platform = match[1];
    const sectionContent = content.slice(match.index + match[0].length).trim();
    
    return renderPlatformCard(platform, sectionContent, 0);
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
            {isEditing ? (
              <Editor value={content} />
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
            )}
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