import { FaInstagram } from 'react-icons/fa';

import { useEmbedConsent } from '../hooks/useEmbedConsent';

import { EmbedConsentPlaceholder } from './consent/EmbedConsentPlaceholder';
import { InstagramEmbed } from './consent/InstagramEmbed';

import type { SocialFeedSection as SocialFeedSectionType } from '../types/candidate';
import '../styles/components/social-feed.css';

interface SocialFeedSectionProps {
  data: SocialFeedSectionType;
}

export function SocialFeedSection({ data }: SocialFeedSectionProps) {
  const { hasConsent, grantConsent } = useEmbedConsent('instagram');

  if (!data.showFeed) {
    return null;
  }

  const renderContent = () => {
    if (!data.instagramUsername) {
      return (
        <div className="social-feed-empty">
          <FaInstagram className="social-feed-empty-icon" />
          <p>Füge deinen Instagram-Benutzernamen hinzu</p>
        </div>
      );
    }

    if (hasConsent) {
      return <InstagramEmbed username={data.instagramUsername} />;
    }

    return <EmbedConsentPlaceholder platform="instagram" onConsent={grantConsent} />;
  };

  return (
    <section className="social-feed-section">
      <div className="social-feed-container">
        <div className="social-feed-header">
          <FaInstagram />
          <h2 className="social-feed-title">{data.title || 'Instagram'}</h2>
        </div>
        <div className="social-feed-content">{renderContent()}</div>
      </div>
    </section>
  );
}
