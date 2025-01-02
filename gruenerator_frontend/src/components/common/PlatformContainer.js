import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { FaTwitter, FaFacebook, FaInstagram, FaLinkedin, FaLightbulb, FaVideo } from 'react-icons/fa';
import { FormContext } from '../utils/FormContext';
import Editor from './Editor';

const PLATFORM_CONFIG = {
  'TWITTER': {
    displayName: 'Twitter',
    icon: FaTwitter,
    color: '#1DA1F2'
  },
  'FACEBOOK': {
    displayName: 'Facebook',
    icon: FaFacebook,
    color: '#4267B2'
  },
  'INSTAGRAM': {
    displayName: 'Instagram',
    icon: FaInstagram,
    color: '#E1306C'
  },
  'LINKEDIN': {
    displayName: 'LinkedIn',
    icon: FaLinkedin,
    color: '#0077B5'
  },
  'ACTIONIDEAS': {
    displayName: 'Aktionsideen',
    icon: FaLightbulb,
    color: '#4caf50'
  },
  'INSTAGRAM REEL': {
    displayName: 'Instagram Reel',
    icon: FaVideo,
    color: '#E1306C'
  }
};

const PlatformContainer = ({ content }) => {
  const { isEditing } = useContext(FormContext);

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

    const cleanContent = cleanHtmlButKeepLinebreaks(content);
    const matches = [...cleanContent.matchAll(/(TWITTER|FACEBOOK|INSTAGRAM|LINKEDIN|ACTIONIDEAS|INSTAGRAM REEL):\s*/g)];
    
    if (matches.length === 0) return cleanContent;
    if (matches.length === 1) return renderSinglePlatform(cleanContent, matches[0]);

    const sections = matches.map((match, index) => {
      const start = match.index + match[0].length;
      const end = index < matches.length - 1 ? matches[index + 1].index : cleanContent.length;
      const platform = match[1];
      const sectionContent = cleanContent.slice(start, end).trim();
      
      return renderPlatformCard(platform, sectionContent);
    });

    return <div className="platforms-container">{sections}</div>;
  };

  const renderSinglePlatform = (content, match) => {
    const platform = match[1];
    const sectionContent = content.slice(match.index + match[0].length).trim();
    
    return renderPlatformCard(platform, sectionContent);
  };

  const renderPlatformCard = (platform, content) => {
    const config = PLATFORM_CONFIG[platform];
    const Icon = config.icon;

    return (
      <div key={platform} className="platform-content">
        <div className="platform-header">
          <div className="platform-title">
            <div className="platform-icon" style={{ color: config.color }}>
              <Icon size={20} />
            </div>
            <h3 className="platform-name">{config.displayName}</h3>
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