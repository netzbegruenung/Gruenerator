import { FaInstagram } from 'react-icons/fa';

import type { SocialFeedSection as SocialFeedSectionType } from '../types/candidate';
import type { EmbedPlatform } from '../types/consent';
import { InstagramEmbed } from './consent/InstagramEmbed';

interface EmbedConsentPlaceholderProps {
  platform: EmbedPlatform;
  onConsent: (remember: boolean) => void;
}

interface SocialFeedSectionProps {
  data: SocialFeedSectionType;
  hasConsent: boolean;
  onConsent: (remember: boolean) => void;
  ConsentPlaceholder?: React.ComponentType<EmbedConsentPlaceholderProps>;
}

export function SocialFeedSection({
  data,
  hasConsent,
  onConsent,
  ConsentPlaceholder,
}: SocialFeedSectionProps) {
  if (!data.showFeed) {
    return null;
  }

  const renderContent = () => {
    if (!data.instagramUsername) {
      return (
        <div className="flex flex-col items-center justify-center py-2xl px-lg bg-[var(--neutral-600)] rounded-[var(--radius-md)] text-center min-h-[200px] border-2 border-dashed border-[var(--border-color)]">
          <FaInstagram className="text-5xl text-[var(--font-color-muted)] mb-[var(--spacing-md)]" />
          <p className="m-0 text-[length:var(--font-size-base)] text-[var(--font-color-muted)]">
            Füge deinen Instagram-Benutzernamen hinzu
          </p>
        </div>
      );
    }

    if (hasConsent) {
      return <InstagramEmbed username={data.instagramUsername} />;
    }

    if (ConsentPlaceholder) {
      return <ConsentPlaceholder platform="instagram" onConsent={onConsent} />;
    }

    return null;
  };

  return (
    <section className="py-[var(--spacing-responsive-xxlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)] bg-[var(--background-color-pure)]">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-[var(--spacing-sm)] mb-[var(--spacing-lg)]">
          <FaInstagram className="w-7 h-7 text-[#E4405F]" />
          <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] md:text-[length:var(--font-size-3xl)] font-bold text-[var(--link-color)] m-0">
            {data.title || 'Instagram'}
          </h2>
        </div>
        <div className="flex justify-center">{renderContent()}</div>
      </div>
    </section>
  );
}
