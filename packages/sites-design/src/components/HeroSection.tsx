import {
  FaFacebook,
  FaTwitter,
  FaInstagram,
  FaYoutube,
  FaLinkedin,
  FaMastodon,
  FaGlobe,
} from 'react-icons/fa';

import type { HeroSection as HeroSectionType } from '../types/candidate';

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
    <section className="bg-white p-0 md:p-[var(--spacing-xxxl-r)_var(--spacing-lg-r)]">
      <div className="grid grid-cols-1 gap-0 items-center text-center max-w-[var(--container-max-width)] mx-auto md:grid-cols-[1fr_1.5fr] md:text-left md:gap-[var(--spacing-xl-r)]">
        {data.imageUrl && (
          <div className="flex justify-center order-first md:order-none w-full">
            <img
              src={data.imageUrl}
              alt={data.name}
              className="w-full aspect-[4/5] object-cover max-w-none md:max-w-[350px] md:aspect-[3/4] md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-lg)] lg:max-w-[400px]"
              loading="eager"
            />
          </div>
        )}
        <div className="flex flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg-r)_var(--spacing-md-r)] md:p-0">
          <h1 className="text-[var(--font-size-xl)] md:text-[var(--font-size-2xl)] lg:text-[var(--font-size-3xl)] xl:text-[var(--font-size-4xl)] font-bold text-[var(--primary-950)] leading-tight">
            {data.name}
          </h1>
          <p className="text-[var(--font-size-base)] md:text-[var(--font-size-lg)] text-[var(--grey-600)] mb-[var(--spacing-md)]">
            {data.tagline}
          </p>
          {socialEntries.length > 0 && (
            <div className="flex gap-[var(--spacing-md)] justify-center md:justify-start">
              {socialEntries.map(([platform, url]) => {
                const IconComponent = socialIconMap[platform] || FaGlobe;
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-12 h-12 bg-[var(--primary-600)] text-white rounded-full transition-all hover:bg-[var(--primary-700)] hover:scale-105 hover:opacity-100"
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
