import {
  FaFacebook,
  FaTwitter,
  FaInstagram,
  FaYoutube,
  FaLinkedin,
  FaMastodon,
  FaGlobe,
} from 'react-icons/fa';

import type { HeroSection as HeroSectionType } from '@/types/candidate';

interface HeroSectionProps {
  data: HeroSectionType;
}

const socialIconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  facebook: FaFacebook,
  twitter: FaTwitter,
  instagram: FaInstagram,
  youtube: FaYoutube,
  linkedin: FaLinkedin,
  mastodon: FaMastodon,
  website: FaGlobe,
};

export function HeroSection({ data }: HeroSectionProps) {
  const socialEntries = Object.entries(data.socialLinks).filter(([, url]) => url);

  return (
    <section className="hero-section">
      <div className="hero-container">
        {data.imageUrl && (
          <div className="hero-image-wrapper">
            <img src={data.imageUrl} alt={data.name} className="hero-portrait" loading="eager" />
          </div>
        )}
        <div className="hero-content">
          <h1 className="hero-name">{data.name}</h1>
          <p className="hero-tagline">{data.tagline}</p>
          {socialEntries.length > 0 && (
            <div className="hero-social-links">
              {socialEntries.map(([platform, url]) => {
                const IconComponent = socialIconMap[platform] || FaGlobe;
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-link"
                    aria-label={platform}
                  >
                    <IconComponent size={24} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
