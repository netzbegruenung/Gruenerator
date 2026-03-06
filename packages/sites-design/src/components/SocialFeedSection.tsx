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
        <div className="flex flex-col items-center justify-center py-[var(--spacing-xxl)] px-[var(--spacing-lg)] bg-[var(--neutral-600)] rounded-[var(--radius-md)] text-center min-h-[200px] border-2 border-dashed border-[var(--grey-200)]">
          <FaInstagram className="text-5xl text-[var(--grey-400)] mb-[var(--spacing-md)]" />
          <p className="m-0 text-[var(--font-size-base)] text-[var(--grey-600)]">
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
    <section className="py-[var(--spacing-xxl-r)] px-[var(--container-padding)] bg-white">
      <div className="max-w-[var(--container-max-width)] mx-auto">
        <div className="flex items-center gap-[var(--spacing-sm)] mb-[var(--spacing-lg)]">
          <FaInstagram className="w-7 h-7 text-[#E4405F]" />
          <h2 className="font-[family-name:var(--font-family-heading)] text-[var(--font-size-2xl)] text-[var(--grey-900)] m-0">
            {data.title || 'Instagram'}
          </h2>
        </div>
        <div className="flex justify-center">{renderContent()}</div>
      </div>
    </section>
  );
}
