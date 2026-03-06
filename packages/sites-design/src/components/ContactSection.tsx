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

import type { ContactSection as ContactSectionType } from '../types/candidate';

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
      className="relative bg-cover bg-center py-[var(--spacing-xxl-r)] md:py-[var(--spacing-xxxl-r)]"
      style={
        data.backgroundImageUrl ? { backgroundImage: `url(${data.backgroundImageUrl})` } : undefined
      }
    >
      <div className="absolute inset-0 bg-black/40 z-[1]" />
      <div className="relative z-[2]">
        <div className="max-w-[var(--container-max-width)] mx-auto p-[var(--spacing-lg-r)_var(--spacing-md-r)] md:p-[var(--spacing-xl-r)_var(--spacing-lg-r)]">
          <div className="flex flex-col">
            <h2 className="text-[var(--font-size-2xl)] md:text-[var(--font-size-3xl)] font-bold text-white mb-[var(--spacing-lg-r)]">
              {data.title}
            </h2>

            <div className="flex flex-col gap-[var(--spacing-sm)] mb-[var(--spacing-lg)]">
              {data.email && (
                <a
                  href={`mailto:${data.email}`}
                  className="flex items-center gap-[var(--spacing-sm)] text-white text-[var(--font-size-base)] hover:underline hover:opacity-100"
                >
                  <FaEnvelope className="w-5 text-center text-white" />
                  <span>{data.email}</span>
                </a>
              )}

              {data.phone && (
                <a
                  href={`tel:${data.phone}`}
                  className="flex items-center gap-[var(--spacing-sm)] text-white text-[var(--font-size-base)] hover:underline hover:opacity-100"
                >
                  <FaPhone className="w-5 text-center text-white" />
                  <span>{data.phone}</span>
                </a>
              )}

              {data.address && (
                <div className="flex items-center gap-[var(--spacing-sm)] text-white text-[var(--font-size-base)]">
                  <FaMapMarkerAlt className="w-5 text-center text-white" />
                  <span>{data.address}</span>
                </div>
              )}
            </div>

            {data.socialMedia.length > 0 && (
              <div className="flex gap-[var(--spacing-md)] justify-center md:justify-start">
                {data.socialMedia.map((social, index) => {
                  const IconComponent = platformIconMap[social.platform] || FaEnvelope;
                  return (
                    <a
                      key={index}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-11 h-11 bg-[var(--primary-600)] text-white rounded-full transition-all duration-300 hover:bg-[var(--primary-400)] hover:-translate-y-0.5 hover:opacity-100"
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
