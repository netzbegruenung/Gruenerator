import {
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaFacebook,
  FaTwitter,
  FaInstagram,
  FaYoutube,
  FaLinkedin,
  FaMastodon,
} from 'react-icons/fa';

import type { ContactSection as ContactSectionType } from '@/types/candidate';

interface ContactSectionProps {
  data: ContactSectionType;
}

const platformIconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  Facebook: FaFacebook,
  Twitter: FaTwitter,
  Instagram: FaInstagram,
  YouTube: FaYoutube,
  LinkedIn: FaLinkedin,
  Mastodon: FaMastodon,
};

export function ContactSection({ data }: ContactSectionProps) {
  return (
    <section
      className="contact-section"
      style={
        data.backgroundImageUrl ? { backgroundImage: `url(${data.backgroundImageUrl})` } : undefined
      }
    >
      <div className="contact-overlay">
        <div className="contact-container">
          <div className="contact-content">
            <h2 className="contact-title">{data.title}</h2>

            <div className="contact-info">
              {data.email && (
                <a href={`mailto:${data.email}`} className="contact-item">
                  <FaEnvelope className="contact-icon" />
                  <span>{data.email}</span>
                </a>
              )}

              {data.phone && (
                <a href={`tel:${data.phone}`} className="contact-item">
                  <FaPhone className="contact-icon" />
                  <span>{data.phone}</span>
                </a>
              )}

              {data.address && (
                <div className="contact-item">
                  <FaMapMarkerAlt className="contact-icon" />
                  <span>{data.address}</span>
                </div>
              )}
            </div>

            {data.socialMedia.length > 0 && (
              <div className="contact-social">
                {data.socialMedia.map((social, index) => {
                  const IconComponent = platformIconMap[social.platform] || FaEnvelope;
                  return (
                    <a
                      key={index}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-social-link"
                      aria-label={social.platform}
                    >
                      <IconComponent size={28} />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
