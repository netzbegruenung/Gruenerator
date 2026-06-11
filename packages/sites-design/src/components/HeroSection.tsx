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

import { HeroImagePlaceholder } from './HeroImagePlaceholder';

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
    <section className="bg-[var(--background-color-pure)] p-0 md:py-16 md:px-[var(--spacing-responsive-large)]">
      <div className="grid grid-cols-1 gap-0 items-center text-center max-w-7xl mx-auto md:grid-cols-[1fr_1.5fr] md:text-left md:gap-[var(--spacing-responsive-xlarge)]">
        <div className="flex justify-center order-first md:order-none w-full">
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt={data.name}
              className="w-full aspect-[4/5] object-cover max-w-none md:max-w-[350px] md:aspect-[3/4] md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-lg)] lg:max-w-[400px]"
              loading="eager"
            />
          ) : (
            <HeroImagePlaceholder className="w-full aspect-[4/5] max-w-none md:max-w-[350px] md:aspect-[3/4] md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-lg)] lg:max-w-[400px]" />
          )}
        </div>
        <div className="flex flex-col gap-[var(--spacing-md)] p-[var(--spacing-responsive-large)_var(--spacing-responsive-medium)] md:p-0">
          <h1 className="font-[GrueneTypeNeue] text-[length:var(--font-size-xl)] md:text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] xl:text-[length:var(--font-size-4xl)] font-bold text-[var(--font-color-h)] leading-tight">
            {data.name}
          </h1>
          <p className="text-[length:var(--font-size-base)] md:text-[length:var(--font-size-lg)] text-[var(--font-color-muted)] mb-[var(--spacing-md)]">
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
